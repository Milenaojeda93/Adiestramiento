import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import {
  homeTasks,
  organizations,
  packageLedger,
  pets,
  programs,
  services,
  skillRatings,
  skills,
  timeOff,
  trainingSessions,
  Tx,
  users,
  workingHours,
} from '@adiestra/db';
import {
  rangeQuerySchema,
  sessionCancelSchema,
  sessionCreateSchema,
  sessionRecordSchema,
  sessionRescheduleSchema,
  timeOffSchema,
  workingHoursSchema,
} from '@adiestra/shared';
import { and, asc, desc, eq, gt, inArray, lt, ne, sql, SQL } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, RequestContext, RequirePermissions } from '../core/context';
import { AppError, notFound } from '../core/errors';
import { col, ownPetsCondition } from '../core/scope';
import { TenantService } from '../core/tenant.service';
import { parse } from '../core/zod';
import { assertTrainer, programBalance } from './training.controller';

const ACTIVE_STATUSES = ['SCHEDULED', 'CONFIRMED', 'DONE'] as const;
const DAY_MS = 86_400_000;
const RECORD_EDIT_HOURS = 24;

/** Día de la semana (0 = domingo) y minuto del día en la zona horaria de la empresa. */
function localParts(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { weekday, minute: Number(get('hour')) * 60 + Number(get('minute')) };
}
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Columnas de sesión para agenda y listados. */
const sessionCols = {
  id: trainingSessions.id,
  startsAt: trainingSessions.startsAt,
  endsAt: trainingSessions.endsAt,
  status: trainingSessions.status,
  modality: trainingSessions.modality,
  location: trainingSessions.location,
  notes: trainingSessions.notes,
  programId: trainingSessions.programId,
  completedAt: trainingSessions.completedAt,
  pet: { id: pets.id, name: pets.name, breed: pets.breed, alerts: pets.alerts },
  trainer: { id: users.id, name: users.name },
  service: services.name,
  owner: sql<string | null>`(select c.first_name || ' ' || c.last_name from pet_guardians g join clients c on c.id = g.client_id
                              where g.pet_id = ${col(pets.id)} and g.role = 'OWNER' order by g.created_at limit 1)`,
  ownerPhone: sql<string | null>`(select coalesce(c.whatsapp, c.phone) from pet_guardians g join clients c on c.id = g.client_id
                                   where g.pet_id = ${col(pets.id)} and g.role = 'OWNER' order by g.created_at limit 1)`,
  sessionNumber: sql<number | null>`case when ${col(trainingSessions.programId)} is null then null else
      (select count(*)::int from training_sessions s2 where s2.program_id = ${col(trainingSessions.programId)}
         and s2.status in ('SCHEDULED','CONFIRMED','DONE') and s2.starts_at <= ${col(trainingSessions.startsAt)}) end`,
  sessionsContracted: programs.sessionsContracted,
};

@Controller()
export class AgendaController {
  constructor(private readonly tenant: TenantService) {}

  private base(tx: Tx) {
    return tx
      .select(sessionCols)
      .from(trainingSessions)
      .innerJoin(pets, eq(pets.id, trainingSessions.petId))
      .leftJoin(users, eq(users.id, trainingSessions.trainerId))
      .leftJoin(programs, eq(programs.id, trainingSessions.programId))
      .leftJoin(services, eq(services.id, programs.serviceId));
  }

  private trainerScope(ctx: RequestContext): SQL | undefined {
    return ctx.membership?.scopeOwn ? eq(trainingSessions.trainerId, ctx.user.id) : undefined;
  }

  // ─────────────── Agenda ───────────────

  @Get('agenda')
  @RequirePermissions('agenda:read')
  agenda(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    const q = parse(rangeQuerySchema, query);
    if (q.to.getTime() - q.from.getTime() > 62 * DAY_MS) throw new AppError(400, 'RANGE_TOO_LONG', 'Pedí como máximo dos meses');
    return this.tenant.run(ctx, async (tx) => {
      const sessions = await this.base(tx)
        .where(
          and(
            lt(trainingSessions.startsAt, q.to),
            gt(trainingSessions.endsAt, q.from),
            q.trainerId ? eq(trainingSessions.trainerId, q.trainerId) : undefined,
            this.trainerScope(ctx),
          ),
        )
        .orderBy(asc(trainingSessions.startsAt));
      const off = await tx
        .select({ id: timeOff.id, userId: timeOff.userId, startsAt: timeOff.startsAt, endsAt: timeOff.endsAt, reason: timeOff.reason })
        .from(timeOff)
        .where(and(lt(timeOff.startsAt, q.to), gt(timeOff.endsAt, q.from)));
      const hours = await tx.select().from(workingHours);
      return { sessions, timeOff: off, workingHours: hours };
    });
  }

  /** Sesiones de hoy del usuario (pantalla "Mi día"). */
  @Get('my-day')
  @RequirePermissions('agenda:read')
  myDay(@Ctx() ctx: RequestContext) {
    const tz = ctx.org!.timezone;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    const from = new Date(`${today}T00:00:00-03:00`);
    const to = new Date(from.getTime() + DAY_MS);
    return this.tenant.run(ctx, (tx) =>
      this.base(tx)
        .where(and(eq(trainingSessions.trainerId, ctx.user.id), lt(trainingSessions.startsAt, to), gt(trainingSessions.startsAt, from), ne(trainingSessions.status, 'CANCELLED')))
        .orderBy(asc(trainingSessions.startsAt)),
    );
  }

  @Get('sessions')
  @RequirePermissions('sessions:read')
  listForPet(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    const q = parse(z.object({ petId: z.string().uuid().optional(), programId: z.string().uuid().optional() }), query);
    return this.tenant.run(ctx, (tx) =>
      this.base(tx)
        .where(
          and(
            q.petId ? eq(trainingSessions.petId, q.petId) : undefined,
            q.programId ? eq(trainingSessions.programId, q.programId) : undefined,
            ownPetsCondition(ctx, trainingSessions.petId),
          ),
        )
        .orderBy(desc(trainingSessions.startsAt))
        .limit(300),
    );
  }

  @Get('sessions/:id')
  @RequirePermissions('sessions:read')
  getSession(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenant.run(ctx, async (tx) => {
      const [s] = await tx
        .select({ session: trainingSessions, petName: pets.name, alerts: pets.alerts, trainerName: users.name, service: services.name, balance: programBalance })
        .from(trainingSessions)
        .innerJoin(pets, eq(pets.id, trainingSessions.petId))
        .leftJoin(users, eq(users.id, trainingSessions.trainerId))
        .leftJoin(programs, eq(programs.id, trainingSessions.programId))
        .leftJoin(services, eq(services.id, programs.serviceId))
        .where(and(eq(trainingSessions.id, id), ownPetsCondition(ctx, trainingSessions.petId)));
      if (!s) throw notFound('Sesión');
      const ratings = await tx
        .select({ skillId: skillRatings.skillId, skill: skills.name, value: skillRatings.value })
        .from(skillRatings)
        .innerJoin(skills, eq(skills.id, skillRatings.skillId))
        .where(eq(skillRatings.sessionId, id));
      // Última calificación anterior de cada habilidad, para mostrar "antes".
      const previous = await tx.execute<{ skill_id: string; value: number }>(sql`
        select distinct on (skill_id) skill_id, value from skill_ratings
        where pet_id = ${s.session.petId} and rated_at < ${s.session.startsAt} and (session_id is null or session_id <> ${id})
        order by skill_id, rated_at desc`);
      const tasks = await tx.select().from(homeTasks).where(eq(homeTasks.sessionId, id));
      return {
        ...s.session,
        petName: s.petName,
        alerts: s.alerts,
        trainerName: s.trainerName,
        service: s.service,
        balance: s.session.programId ? s.balance : null,
        ratings,
        previousRatings: Object.fromEntries(previous.rows.map((r) => [r.skill_id, r.value])),
        tasks,
      };
    });
  }

  /**
   * Valida que el horario sea posible: dentro del horario laboral del entrenador (si lo tiene cargado),
   * fuera de sus ausencias y sin choques con otras sesiones. Si choca, sugiere horarios libres ese día.
   */
  private async assertAvailable(tx: Tx, ctx: RequestContext, trainerId: string, startsAt: Date, endsAt: Date, ignoreId?: string) {
    const tz = ctx.org!.timezone;
    const s = localParts(startsAt, tz);
    const e = localParts(new Date(endsAt.getTime() - 1), tz);
    const hours = await tx.select().from(workingHours).where(eq(workingHours.userId, trainerId));
    if (hours.length) {
      const fits = hours.some((h) => h.weekday === s.weekday && h.startMinute <= s.minute && e.minute < h.endMinute && e.weekday === s.weekday);
      if (!fits) {
        const today = hours.filter((h) => h.weekday === s.weekday).map((h) => `${hhmm(h.startMinute)} a ${hhmm(h.endMinute)}`);
        throw new AppError(409, 'OUTSIDE_HOURS', today.length ? `Fuera del horario del entrenador ese día (${today.join(', ')})` : 'El entrenador no trabaja ese día');
      }
    }
    const [off] = await tx
      .select({ reason: timeOff.reason })
      .from(timeOff)
      .where(and(eq(timeOff.userId, trainerId), lt(timeOff.startsAt, endsAt), gt(timeOff.endsAt, startsAt)));
    if (off) throw new AppError(409, 'TIME_OFF', `El entrenador no está disponible${off.reason ? `: ${off.reason}` : ''}`);

    const clash = await tx
      .select({ id: trainingSessions.id, startsAt: trainingSessions.startsAt, endsAt: trainingSessions.endsAt, petName: pets.name })
      .from(trainingSessions)
      .innerJoin(pets, eq(pets.id, trainingSessions.petId))
      .where(
        and(
          eq(trainingSessions.trainerId, trainerId),
          inArray(trainingSessions.status, [...ACTIVE_STATUSES]),
          lt(trainingSessions.startsAt, endsAt),
          gt(trainingSessions.endsAt, startsAt),
          ignoreId ? ne(trainingSessions.id, ignoreId) : undefined,
        ),
      );
    if (clash.length) {
      const c = clash[0];
      const suggestions = await this.freeSlots(tx, ctx, trainerId, startsAt, endsAt.getTime() - startsAt.getTime(), ignoreId);
      throw new AppError(409, 'SCHEDULE_CONFLICT', `El entrenador ya tiene a ${c.petName} de ${hhmm(localParts(c.startsAt, tz).minute)} a ${hhmm(localParts(c.endsAt, tz).minute)}`, {
        suggestions,
      });
    }
  }

  /** Hasta 4 horarios libres el mismo día, cada 30 minutos, dentro del horario laboral (o 08:00–19:00). */
  private async freeSlots(tx: Tx, ctx: RequestContext, trainerId: string, day: Date, durationMs: number, ignoreId?: string) {
    const tz = ctx.org!.timezone;
    const dayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(day);
    const dayStart = new Date(`${dayStr}T00:00:00-03:00`);
    const weekday = localParts(day, tz).weekday;
    const hours = (await tx.select().from(workingHours).where(eq(workingHours.userId, trainerId))).filter((h) => h.weekday === weekday);
    const windows = hours.length ? hours.map((h) => [h.startMinute, h.endMinute]) : [[8 * 60, 19 * 60]];
    const busy = await tx
      .select({ s: trainingSessions.startsAt, e: trainingSessions.endsAt })
      .from(trainingSessions)
      .where(
        and(
          eq(trainingSessions.trainerId, trainerId),
          inArray(trainingSessions.status, [...ACTIVE_STATUSES]),
          lt(trainingSessions.startsAt, new Date(dayStart.getTime() + DAY_MS)),
          gt(trainingSessions.endsAt, dayStart),
          ignoreId ? ne(trainingSessions.id, ignoreId) : undefined,
        ),
      );
    const out: string[] = [];
    const durMin = durationMs / 60000;
    for (const [a, b] of windows) {
      for (let m = a; m + durMin <= b && out.length < 4; m += 30) {
        const s = dayStart.getTime() + m * 60000;
        const e = s + durationMs;
        if (s < Date.now()) continue;
        if (!busy.some((x) => x.s.getTime() < e && x.e.getTime() > s)) out.push(new Date(s).toISOString());
      }
    }
    return out;
  }

  @Post('sessions')
  @RequirePermissions('agenda:create')
  create(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const input = parse(sessionCreateSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const [pet] = await tx.select({ id: pets.id, status: pets.status }).from(pets).where(eq(pets.id, input.petId));
      if (!pet) throw new AppError(400, 'INVALID_PET', 'La mascota no existe');
      await assertTrainer(tx, input.trainerId);
      if (input.programId) {
        const [p] = await tx.select({ petId: programs.petId, status: programs.status }).from(programs).where(eq(programs.id, input.programId));
        if (!p || p.petId !== input.petId) throw new AppError(400, 'INVALID_PROGRAM', 'El programa no corresponde a esa mascota');
        if (p.status !== 'ACTIVE') throw new AppError(400, 'PROGRAM_NOT_ACTIVE', 'El programa no está activo');
      }
      const created = [];
      for (let w = 0; w < input.repeatWeeks; w++) {
        const startsAt = new Date(input.startsAt.getTime() + w * 7 * DAY_MS);
        const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60000);
        await this.assertAvailable(tx, ctx, input.trainerId, startsAt, endsAt);
        const [row] = await tx
          .insert(trainingSessions)
          .values({
            organizationId: ctx.org!.id,
            petId: input.petId,
            programId: input.programId ?? null,
            trainerId: input.trainerId,
            startsAt,
            endsAt,
            modality: input.modality,
            location: input.location,
            notes: input.notes,
            createdBy: ctx.user.id,
          })
          .returning();
        created.push(row);
      }
      await this.tenant.audit(tx, ctx, { action: 'session.create', entity: 'session', entityId: created[0].id, after: { count: created.length, first: created[0] } });
      return created;
    });
  }

  @Patch('sessions/:id/reschedule')
  @RequirePermissions('agenda:update')
  reschedule(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(sessionRescheduleSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const before = await this.getEditable(tx, ctx, id);
      const trainerId = input.trainerId ?? before.trainerId;
      if (input.trainerId) await assertTrainer(tx, trainerId);
      const duration = input.durationMinutes ? input.durationMinutes * 60000 : before.endsAt.getTime() - before.startsAt.getTime();
      const endsAt = new Date(input.startsAt.getTime() + duration);
      await this.assertAvailable(tx, ctx, trainerId, input.startsAt, endsAt, id);
      const late = await this.isLate(tx, before.startsAt);
      const [row] = await tx
        .update(trainingSessions)
        .set({ startsAt: input.startsAt, endsAt, trainerId, location: input.location ?? before.location, notes: input.notes ?? before.notes, status: 'SCHEDULED' })
        .where(eq(trainingSessions.id, id))
        .returning();
      await this.tenant.audit(tx, ctx, { action: late ? 'session.reschedule_late' : 'session.reschedule', entity: 'session', entityId: id, before, after: row });
      return { ...row, late };
    });
  }

  @Post('sessions/:id/confirm')
  @HttpCode(200)
  @RequirePermissions('agenda:update')
  confirm(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenant.run(ctx, async (tx) => {
      await this.getEditable(tx, ctx, id);
      const [row] = await tx.update(trainingSessions).set({ status: 'CONFIRMED' }).where(eq(trainingSessions.id, id)).returning();
      await this.tenant.audit(tx, ctx, { action: 'session.confirm', entity: 'session', entityId: id });
      return row;
    });
  }

  @Post('sessions/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('agenda:update')
  cancel(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { reason } = parse(sessionCancelSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const before = await this.getEditable(tx, ctx, id);
      const late = await this.isLate(tx, before.startsAt);
      const [row] = await tx.update(trainingSessions).set({ status: 'CANCELLED', cancelReason: reason }).where(eq(trainingSessions.id, id)).returning();
      await this.tenant.audit(tx, ctx, { action: late ? 'session.cancel_late' : 'session.cancel', entity: 'session', entityId: id, after: { reason } });
      return { ...row, late };
    });
  }

  /** Cancelación o cambio con menos anticipación que la política de la empresa. */
  private async isLate(tx: Tx, startsAt: Date) {
    const [org] = await tx.select({ h: organizations.cancelHours }).from(organizations);
    return startsAt.getTime() - Date.now() < (org?.h ?? 24) * 3600_000;
  }

  private async getEditable(tx: Tx, ctx: RequestContext, id: string) {
    const [s] = await tx
      .select()
      .from(trainingSessions)
      .where(and(eq(trainingSessions.id, id), this.trainerScope(ctx)));
    if (!s) throw notFound('Sesión');
    if (s.status === 'DONE' || s.status === 'NO_SHOW') throw new AppError(400, 'ALREADY_RECORDED', 'La sesión ya fue registrada: no se puede mover ni cancelar');
    if (s.status === 'CANCELLED') throw new AppError(400, 'CANCELLED', 'La sesión está cancelada');
    return s;
  }

  // ─────────────── Registro del entrenamiento ───────────────

  /**
   * Registrar la sesión: guarda el seguimiento, las calificaciones y las tareas para casa.
   * Descuenta 1 sesión del paquete si se realizó, o si fue ausencia y la política de la empresa lo indica.
   * Una sesión nunca se descuenta sin haberse registrado.
   */
  @Post('sessions/:id/record')
  @HttpCode(200)
  @RequirePermissions('sessions:create')
  record(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(sessionRecordSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const s = await this.getEditable(tx, ctx, id);
      if (s.startsAt.getTime() > Date.now() + 2 * 3600_000) throw new AppError(400, 'FUTURE_SESSION', 'No se puede registrar una sesión que todavía no ocurrió');
      const [org] = await tx.select({ noShowConsumes: organizations.noShowConsumes }).from(organizations);
      const consumes = s.programId && (input.attendance === 'DONE' || org.noShowConsumes);
      if (consumes) {
        const [p] = await tx.select({ balance: programBalance }).from(programs).where(eq(programs.id, s.programId!));
        if (p.balance <= 0) throw new AppError(400, 'PACKAGE_EMPTY', 'El paquete no tiene sesiones disponibles. Ajustá el paquete o contratá un programa nuevo.');
      }
      const done = input.attendance === 'DONE';
      const [row] = await tx
        .update(trainingSessions)
        .set({
          status: input.attendance,
          objectives: input.objectives,
          exercises: input.exercises,
          commands: input.commands,
          results: input.results,
          difficulties: input.difficulties,
          behavior: input.behavior,
          responseLevel: input.responseLevel,
          internalNotes: input.internalNotes,
          nextGoals: input.nextGoals,
          completedAt: new Date(),
          completedBy: ctx.user.id,
        })
        .where(eq(trainingSessions.id, id))
        .returning();
      if (consumes) {
        await tx.insert(packageLedger).values({
          organizationId: ctx.org!.id,
          programId: s.programId!,
          kind: 'CONSUME',
          delta: -1,
          sessionId: id,
          note: done ? 'Sesión realizada' : 'Ausencia sin aviso (según política)',
          createdBy: ctx.user.id,
        });
      }
      if (done && input.ratings.length) {
        await tx.insert(skillRatings).values(
          input.ratings.map((r) => ({ organizationId: ctx.org!.id, petId: s.petId, skillId: r.skillId, value: r.value, sessionId: id, ratedAt: s.startsAt })),
        );
      }
      if (done && input.tasks.length) {
        await tx.insert(homeTasks).values(input.tasks.map((t) => ({ ...t, organizationId: ctx.org!.id, petId: s.petId, sessionId: id })));
      }
      await this.tenant.audit(tx, ctx, { action: done ? 'session.record' : 'session.no_show', entity: 'session', entityId: id, after: { consumed: !!consumes } });
      return { ...row, consumed: !!consumes };
    });
  }

  /** Corregir el registro: el entrenador tiene 24 h; después, solo quien puede eliminar sesiones. */
  @Patch('sessions/:id/record')
  @RequirePermissions('sessions:update')
  editRecord(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { attendance: _a, ratings, tasks: _t, ...input } = parse(sessionRecordSchema.partial(), body);
    return this.tenant.run(ctx, async (tx) => {
      const [s] = await tx.select().from(trainingSessions).where(and(eq(trainingSessions.id, id), this.trainerScope(ctx)));
      if (!s || s.status !== 'DONE') throw notFound('Registro de sesión');
      const expired = Date.now() - (s.completedAt?.getTime() ?? 0) > RECORD_EDIT_HOURS * 3600_000;
      if (expired && !ctx.membership!.permissions.has('sessions:delete')) {
        throw new AppError(403, 'EDIT_WINDOW', `El registro solo se puede corregir durante ${RECORD_EDIT_HOURS} h. Pedíselo a un administrador.`);
      }
      const [row] = await tx.update(trainingSessions).set(input).where(eq(trainingSessions.id, id)).returning();
      if (ratings) {
        await tx.delete(skillRatings).where(eq(skillRatings.sessionId, id));
        if (ratings.length)
          await tx.insert(skillRatings).values(ratings.map((r) => ({ organizationId: ctx.org!.id, petId: s.petId, skillId: r.skillId, value: r.value, sessionId: id, ratedAt: s.startsAt })));
      }
      await this.tenant.audit(tx, ctx, { action: 'session.record_edit', entity: 'session', entityId: id, before: s, after: row });
      return row;
    });
  }

  /** Deshacer un registro hecho por error: devuelve la sesión al paquete. Solo administradores. */
  @Post('sessions/:id/revert')
  @HttpCode(200)
  @RequirePermissions('sessions:delete')
  revert(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { reason } = parse(sessionCancelSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const [s] = await tx.select().from(trainingSessions).where(eq(trainingSessions.id, id));
      if (!s || (s.status !== 'DONE' && s.status !== 'NO_SHOW')) throw new AppError(400, 'NOT_RECORDED', 'La sesión no está registrada');
      const [consumed] = await tx
        .select({ n: sql<number>`coalesce(sum(${packageLedger.delta}), 0)::int` })
        .from(packageLedger)
        .where(eq(packageLedger.sessionId, id));
      if (consumed.n < 0 && s.programId) {
        await tx.insert(packageLedger).values({
          organizationId: ctx.org!.id,
          programId: s.programId,
          kind: 'REVERSE',
          delta: -consumed.n,
          sessionId: id,
          note: `Registro revertido: ${reason}`,
          createdBy: ctx.user.id,
        });
      }
      await tx.delete(skillRatings).where(eq(skillRatings.sessionId, id));
      const [row] = await tx.update(trainingSessions).set({ status: 'CONFIRMED', completedAt: null, completedBy: null }).where(eq(trainingSessions.id, id)).returning();
      await this.tenant.audit(tx, ctx, { action: 'session.revert', entity: 'session', entityId: id, before: s, after: { reason } });
      return row;
    });
  }

  // ─────────────── Tareas para casa ───────────────

  @Get('pets/:id/tasks')
  @RequirePermissions('pets:read')
  tasks(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenant.run(ctx, (tx) => tx.select().from(homeTasks).where(eq(homeTasks.petId, id)).orderBy(asc(homeTasks.done), desc(homeTasks.createdAt)));
  }

  @Patch('tasks/:id')
  @RequirePermissions('sessions:update')
  updateTask(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(z.object({ done: z.boolean() }), body);
    return this.tenant.run(ctx, async (tx) => {
      const [row] = await tx.update(homeTasks).set(input).where(eq(homeTasks.id, id)).returning();
      if (!row) throw notFound('Tarea');
      return row;
    });
  }

  // ─────────────── Horarios y ausencias ───────────────

  @Get('working-hours')
  @RequirePermissions('agenda:read')
  getHours(@Ctx() ctx: RequestContext) {
    return this.tenant.run(ctx, async (tx) => ({
      hours: await tx.select().from(workingHours).orderBy(asc(workingHours.weekday), asc(workingHours.startMinute)),
      timeOff: await tx
        .select({ id: timeOff.id, userId: timeOff.userId, startsAt: timeOff.startsAt, endsAt: timeOff.endsAt, reason: timeOff.reason })
        .from(timeOff)
        .where(gt(timeOff.endsAt, new Date()))
        .orderBy(asc(timeOff.startsAt)),
    }));
  }

  /** Reemplaza el horario semanal completo de un entrenador. */
  @Put('working-hours')
  @RequirePermissions('settings:update')
  setHours(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const input = parse(workingHoursSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      await assertTrainer(tx, input.userId);
      await tx.delete(workingHours).where(eq(workingHours.userId, input.userId));
      if (input.blocks.length) await tx.insert(workingHours).values(input.blocks.map((b) => ({ ...b, organizationId: ctx.org!.id, userId: input.userId })));
      await this.tenant.audit(tx, ctx, { action: 'agenda.working_hours', entity: 'user', entityId: input.userId, after: input.blocks });
      return { ok: true };
    });
  }

  @Post('time-off')
  @RequirePermissions('settings:update')
  addTimeOff(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const input = parse(timeOffSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      await assertTrainer(tx, input.userId);
      const [row] = await tx.insert(timeOff).values({ ...input, organizationId: ctx.org!.id }).returning();
      return row;
    });
  }

  @Delete('time-off/:id')
  @HttpCode(204)
  @RequirePermissions('settings:update')
  removeTimeOff(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenant.run(ctx, async (tx) => {
      await tx.delete(timeOff).where(eq(timeOff.id, id));
    });
  }
}

