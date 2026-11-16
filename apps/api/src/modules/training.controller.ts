import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { assessments, charges, clients, memberships, packageLedger, petGuardians, pets, programs, roles, services, skillRatings, skills, Tx, users } from '@adiestra/db';
import {
  assessmentSchema,
  DEFAULT_SKILLS,
  packageAdjustSchema,
  programSchema,
  programUpdateSchema,
  serviceSchema,
} from '@adiestra/shared';
import { and, asc, desc, eq, inArray, isNull, sql, SQL } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, RequestContext, RequirePermissions } from '../core/context';
import { AppError, notFound } from '../core/errors';
import { col, ownPetsCondition } from '../core/scope';
import { TenantService } from '../core/tenant.service';
import { parse } from '../core/zod';

/** Saldo de sesiones de un programa: suma del libro de movimientos. */
export const programBalance = sql<number>`coalesce((select sum(l.delta)::int from package_ledger l where l.program_id = ${col(programs.id)}), 0)`;
export const programDone = sql<number>`(select count(*)::int from training_sessions s where s.program_id = ${col(programs.id)} and s.status = 'DONE')`;

/** Suma meses a una fecha AAAA-MM-DD sin problemas de zona horaria. */
function addMonths(isoDate: string, months: number) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
const addDays = (isoDate: string, days: number) => new Date(Date.parse(isoDate + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);

/** Verifica que el usuario sea miembro activo con rol de entrenador o administrador. */
export async function assertTrainer(tx: Tx, userId: string) {
  const [m] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(and(eq(memberships.userId, userId), eq(memberships.active, true), sql`${roles.permissions} @> array['sessions:create']::text[]`));
  if (!m) throw new AppError(400, 'INVALID_TRAINER', 'Esa persona no puede tener sesiones a cargo');
}

@Controller()
export class TrainingController {
  constructor(private readonly tenant: TenantService) {}

  // ─────────────── Equipo que entrena ───────────────

  /** Personas que pueden tener mascotas y sesiones a cargo (para los selectores). */
  @Get('trainers')
  trainers(@Ctx() ctx: RequestContext) {
    return this.tenant.run(ctx, (tx) =>
      tx
        .select({ id: users.id, name: users.name, role: roles.name })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .innerJoin(roles, eq(roles.id, memberships.roleId))
        .where(and(eq(memberships.active, true), sql`${roles.permissions} @> array['sessions:create']::text[]`))
        .orderBy(asc(users.name)),
    );
  }

  // ─────────────── Habilidades ───────────────

  @Get('skills')
  async skillList(@Ctx() ctx: RequestContext) {
    return this.tenant.run(ctx, async (tx) => {
      let rows = await tx.select().from(skills).orderBy(asc(skills.sortOrder), asc(skills.name));
      if (rows.length === 0 && !ctx.org!.readOnly) {
        rows = await tx
          .insert(skills)
          .values(DEFAULT_SKILLS.map((name, i) => ({ organizationId: ctx.org!.id, name, sortOrder: i })))
          .returning();
      }
      return rows;
    });
  }

  @Post('skills')
  @RequirePermissions('settings:update')
  createSkill(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(60) }), body);
    return this.tenant.run(ctx, async (tx) => {
      const [{ n }] = await tx.select({ n: sql<number>`coalesce(max(sort_order), 0)::int` }).from(skills);
      const [row] = await tx.insert(skills).values({ organizationId: ctx.org!.id, name, sortOrder: n + 1 }).returning();
      return row;
    });
  }

  @Patch('skills/:id')
  @RequirePermissions('settings:update')
  updateSkill(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(z.object({ name: z.string().trim().min(1).max(60).optional(), active: z.boolean().optional() }), body);
    return this.tenant.run(ctx, async (tx) => {
      const [row] = await tx.update(skills).set(input).where(eq(skills.id, id)).returning();
      if (!row) throw notFound('Habilidad');
      return row;
    });
  }

  /** Evolución de una mascota: todas las calificaciones por habilidad, en orden cronológico. */
  @Get('pets/:id/progress')
  @RequirePermissions('pets:read')
  progress(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenant.run(ctx, async (tx) => {
      const [pet] = await tx.select({ id: pets.id }).from(pets).where(and(eq(pets.id, id), ownPetsCondition(ctx, pets.id)));
      if (!pet) throw notFound('Mascota');
      return tx
        .select({
          skillId: skillRatings.skillId,
          skill: skills.name,
          value: skillRatings.value,
          ratedAt: skillRatings.ratedAt,
          source: sql<'assessment' | 'session'>`case when ${skillRatings.assessmentId} is not null then 'assessment' else 'session' end`,
        })
        .from(skillRatings)
        .innerJoin(skills, eq(skills.id, skillRatings.skillId))
        .where(eq(skillRatings.petId, id))
        .orderBy(asc(skillRatings.ratedAt));
    });
  }

  // ─────────────── Evaluaciones ───────────────

  @Get('assessments')
  @RequirePermissions('assessments:read')
  listAssessments(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    const q = parse(z.object({ petId: z.string().uuid().optional() }), query);
    return this.tenant.run(ctx, (tx) =>
      tx
        .select({
          id: assessments.id,
          petId: assessments.petId,
          petName: pets.name,
          assessedAt: assessments.assessedAt,
          reason: assessments.reason,
          published: assessments.published,
          trainerName: users.name,
        })
        .from(assessments)
        .innerJoin(pets, eq(pets.id, assessments.petId))
        .leftJoin(users, eq(users.id, assessments.trainerId))
        .where(and(q.petId ? eq(assessments.petId, q.petId) : undefined, ownPetsCondition(ctx, pets.id)))
        .orderBy(desc(assessments.assessedAt), desc(assessments.createdAt))
        .limit(200),
    );
  }

  @Get('assessments/:id')
  @RequirePermissions('assessments:read')
  getAssessment(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenant.run(ctx, async (tx) => {
      const [a] = await tx
        .select({ assessment: assessments, petName: pets.name, breed: pets.breed, birthDate: pets.birthDate, trainerName: users.name })
        .from(assessments)
        .innerJoin(pets, eq(pets.id, assessments.petId))
        .leftJoin(users, eq(users.id, assessments.trainerId))
        .where(and(eq(assessments.id, id), ownPetsCondition(ctx, pets.id)));
      if (!a) throw notFound('Evaluación');
      const ratings = await tx
        .select({ skillId: skillRatings.skillId, skill: skills.name, value: skillRatings.value })
        .from(skillRatings)
        .innerJoin(skills, eq(skills.id, skillRatings.skillId))
        .where(eq(skillRatings.assessmentId, id))
        .orderBy(asc(skills.sortOrder));
      const owners = await tx
        .select({ firstName: clients.firstName, lastName: clients.lastName, phone: clients.phone })
        .from(petGuardians)
        .innerJoin(clients, eq(clients.id, petGuardians.clientId))
        .where(and(eq(petGuardians.petId, a.assessment.petId), eq(petGuardians.role, 'OWNER')));
      return { ...a.assessment, petName: a.petName, breed: a.breed, birthDate: a.birthDate, trainerName: a.trainerName, ratings, owners };
    });
  }

  @Post('assessments')
  @RequirePermissions('assessments:create')
  createAssessment(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const { ratings, ...input } = parse(assessmentSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const [pet] = await tx.select({ id: pets.id }).from(pets).where(and(eq(pets.id, input.petId), isNull(pets.deletedAt)));
      if (!pet) throw new AppError(400, 'INVALID_PET', 'La mascota no existe');
      const [row] = await tx
        .insert(assessments)
        .values({ ...input, assessedAt: input.assessedAt ?? undefined, organizationId: ctx.org!.id, trainerId: ctx.user.id })
        .returning();
      if (ratings.length) {
        await this.assertSkills(tx, ratings.map((r) => r.skillId));
        await tx.insert(skillRatings).values(
          ratings.map((r) => ({
            organizationId: ctx.org!.id,
            petId: input.petId,
            skillId: r.skillId,
            value: r.value,
            assessmentId: row.id,
            ratedAt: new Date((input.assessedAt ?? new Date().toISOString().slice(0, 10)) + 'T12:00:00-03:00'),
          })),
        );
      }
      await this.tenant.audit(tx, ctx, { action: 'assessment.create', entity: 'assessment', entityId: row.id, after: row });
      return row;
    });
  }

  @Patch('assessments/:id')
  @RequirePermissions('assessments:update')
  updateAssessment(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { ratings, petId: _p, ...input } = parse(assessmentSchema.partial().extend({ ratings: assessmentSchema.shape.ratings.optional() }), body);
    return this.tenant.run(ctx, async (tx) => {
      const [before] = await tx.select().from(assessments).where(eq(assessments.id, id));
      if (!before) throw notFound('Evaluación');
      const [row] = await tx
        .update(assessments)
        .set({ ...input, assessedAt: input.assessedAt ?? undefined })
        .where(eq(assessments.id, id))
        .returning();
      if (ratings) {
        await this.assertSkills(tx, ratings.map((r) => r.skillId));
        await tx.delete(skillRatings).where(eq(skillRatings.assessmentId, id));
        if (ratings.length)
          await tx.insert(skillRatings).values(
            ratings.map((r) => ({
              organizationId: ctx.org!.id,
              petId: before.petId,
              skillId: r.skillId,
              value: r.value,
              assessmentId: id,
              ratedAt: new Date(row.assessedAt + 'T12:00:00-03:00'),
            })),
          );
      }
      await this.tenant.audit(tx, ctx, { action: 'assessment.update', entity: 'assessment', entityId: id, before, after: row });
      return row;
    });
  }

  private async assertSkills(tx: Tx, ids: string[]) {
    const found = await tx.select({ id: skills.id }).from(skills).where(inArray(skills.id, ids));
    if (found.length !== new Set(ids).size) throw new AppError(400, 'INVALID_SKILL', 'Habilidad no válida');
  }

  // ─────────────── Servicios ───────────────

  @Get('services')
  @RequirePermissions('services:read')
  listServices(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    const q = parse(z.object({ all: z.coerce.boolean().default(false) }), query);
    return this.tenant.run(ctx, (tx) =>
      tx
        .select()
        .from(services)
        .where(q.all ? undefined : eq(services.active, true))
        .orderBy(asc(services.category), asc(services.name)),
    );
  }

  @Post('services')
  @RequirePermissions('services:create')
  createService(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const input = parse(serviceSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const [row] = await tx.insert(services).values({ ...input, organizationId: ctx.org!.id }).returning();
      await this.tenant.audit(tx, ctx, { action: 'service.create', entity: 'service', entityId: row.id, after: row });
      return row;
    });
  }

  @Patch('services/:id')
  @RequirePermissions('services:update')
  updateService(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(serviceSchema.partial(), body);
    return this.tenant.run(ctx, async (tx) => {
      const [before] = await tx.select().from(services).where(eq(services.id, id));
      if (!before) throw notFound('Servicio');
      const [row] = await tx.update(services).set(input).where(eq(services.id, id)).returning();
      await this.tenant.audit(tx, ctx, { action: 'service.update', entity: 'service', entityId: id, before, after: row });
      return row;
    });
  }

  // ─────────────── Programas ───────────────

  @Get('programs')
  @RequirePermissions('programs:read')
  listPrograms(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    const q = parse(
      z.object({
        petId: z.string().uuid().optional(),
        clientId: z.string().uuid().optional(),
        status: z.enum(['PENDING', 'ACTIVE', 'PAUSED', 'FINISHED', 'CANCELLED', 'ALL']).default('ALL'),
      }),
      query,
    );
    return this.tenant.run(ctx, (tx) => {
      const where: (SQL | undefined)[] = [ownPetsCondition(ctx, programs.petId)];
      if (q.petId) where.push(eq(programs.petId, q.petId));
      if (q.clientId) where.push(eq(programs.clientId, q.clientId));
      if (q.status !== 'ALL') where.push(eq(programs.status, q.status));
      return tx
        .select({
          id: programs.id,
          status: programs.status,
          startDate: programs.startDate,
          endDate: programs.endDate,
          expiresAt: programs.expiresAt,
          sessionsContracted: programs.sessionsContracted,
          price: programs.price,
          goals: programs.goals,
          service: { id: services.id, name: services.name, modality: services.modality },
          pet: { id: pets.id, name: pets.name },
          client: { id: clients.id, firstName: clients.firstName, lastName: clients.lastName },
          trainer: { id: users.id, name: users.name },
          balance: programBalance,
          done: programDone,
        })
        .from(programs)
        .innerJoin(services, eq(services.id, programs.serviceId))
        .innerJoin(pets, eq(pets.id, programs.petId))
        .innerJoin(clients, eq(clients.id, programs.clientId))
        .leftJoin(users, eq(users.id, programs.trainerId))
        .where(and(...where))
        .orderBy(desc(programs.startDate))
        .limit(300);
    });
  }

  @Get('programs/:id')
  @RequirePermissions('programs:read')
  getProgram(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenant.run(ctx, async (tx) => {
      const [list] = await tx
        .select({
          program: programs,
          service: services.name,
          petName: pets.name,
          clientName: sql<string>`${clients.firstName} || ' ' || ${clients.lastName}`,
          trainerName: users.name,
          balance: programBalance,
          done: programDone,
        })
        .from(programs)
        .innerJoin(services, eq(services.id, programs.serviceId))
        .innerJoin(pets, eq(pets.id, programs.petId))
        .innerJoin(clients, eq(clients.id, programs.clientId))
        .leftJoin(users, eq(users.id, programs.trainerId))
        .where(and(eq(programs.id, id), ownPetsCondition(ctx, programs.petId)));
      if (!list) throw notFound('Programa');
      const ledger = await tx
        .select({ id: packageLedger.id, kind: packageLedger.kind, delta: packageLedger.delta, note: packageLedger.note, createdAt: packageLedger.createdAt, sessionId: packageLedger.sessionId })
        .from(packageLedger)
        .where(eq(packageLedger.programId, id))
        .orderBy(desc(packageLedger.createdAt));
      return { ...list.program, service: list.service, petName: list.petName, clientName: list.clientName, trainerName: list.trainerName, balance: list.balance, done: list.done, ledger };
    });
  }

  /**
   * Alta de programa: guarda el programa, acredita las sesiones contratadas en el libro del paquete
   * y genera los cargos a cobrar (una cuota o varias, mensuales).
   */
  @Post('programs')
  @RequirePermissions('programs:create')
  createProgram(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const input = parse(programSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const [service] = await tx.select().from(services).where(eq(services.id, input.serviceId));
      if (!service) throw new AppError(400, 'INVALID_SERVICE', 'El servicio no existe');
      const [link] = await tx
        .select({ id: petGuardians.id })
        .from(petGuardians)
        .where(and(eq(petGuardians.petId, input.petId), eq(petGuardians.clientId, input.clientId)));
      if (!link) throw new AppError(400, 'NOT_GUARDIAN', 'Ese cliente no es responsable de la mascota');
      await assertTrainer(tx, input.trainerId);

      const sessionsContracted = input.sessionsContracted ?? service.sessionsCount;
      const price = input.price ?? service.price;
      if (input.discount > price) throw new AppError(400, 'VALIDATION', 'El descuento supera el precio', [{ field: 'discount', message: 'Supera el precio' }]);
      const expiresAt = service.validityDays ? addDays(input.startDate, service.validityDays) : null;

      const [program] = await tx
        .insert(programs)
        .values({
          organizationId: ctx.org!.id,
          petId: input.petId,
          clientId: input.clientId,
          serviceId: input.serviceId,
          trainerId: input.trainerId,
          startDate: input.startDate,
          endDate: input.endDate,
          expiresAt,
          goals: input.goals,
          notes: input.notes,
          sessionsContracted,
          price,
          status: 'ACTIVE',
          createdBy: ctx.user.id,
        })
        .returning();

      await tx.insert(packageLedger).values({
        organizationId: ctx.org!.id,
        programId: program.id,
        kind: 'PURCHASE',
        delta: sessionsContracted,
        note: `${service.name}: ${sessionsContracted} ${sessionsContracted === 1 ? 'sesión' : 'sesiones'}`,
        createdBy: ctx.user.id,
      });

      const net = price - input.discount;
      if (net > 0) {
        const n = input.installments;
        const base = Math.floor(net / n);
        const first = input.firstDueDate ?? input.startDate;
        await tx.insert(charges).values(
          Array.from({ length: n }, (_, i) => ({
            organizationId: ctx.org!.id,
            clientId: input.clientId,
            programId: program.id,
            concept: n === 1 ? service.name : `${service.name} · cuota ${i + 1} de ${n}`,
            amount: i === 0 ? net - base * (n - 1) : base,
            dueDate: addMonths(first, i),
            createdBy: ctx.user.id,
          })),
        );
      }

      await this.tenant.audit(tx, ctx, { action: 'program.create', entity: 'program', entityId: program.id, after: program });
      return program;
    });
  }

  @Patch('programs/:id')
  @RequirePermissions('programs:create')
  updateProgram(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(programUpdateSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const [before] = await tx.select().from(programs).where(eq(programs.id, id));
      if (!before) throw notFound('Programa');
      if (input.trainerId) await assertTrainer(tx, input.trainerId);
      const patch = { ...input, endDate: input.status === 'FINISHED' && !input.endDate ? new Date().toISOString().slice(0, 10) : input.endDate ?? undefined };
      const [row] = await tx.update(programs).set(patch).where(eq(programs.id, id)).returning();
      await this.tenant.audit(tx, ctx, { action: input.status ? `program.status_${input.status.toLowerCase()}` : 'program.update', entity: 'program', entityId: id, before, after: row });
      return row;
    });
  }

  /** Ajuste manual del paquete (ej. sesión de cortesía). Siempre con motivo y auditado. */
  @Post('programs/:id/adjust')
  @RequirePermissions('programs:create')
  adjust(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(packageAdjustSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const [p] = await tx.select({ id: programs.id, balance: programBalance }).from(programs).where(eq(programs.id, id));
      if (!p) throw notFound('Programa');
      if (p.balance + input.delta < 0) throw new AppError(400, 'NEGATIVE_BALANCE', 'El paquete no puede quedar con saldo negativo');
      const [row] = await tx
        .insert(packageLedger)
        .values({ organizationId: ctx.org!.id, programId: id, kind: 'ADJUST', delta: input.delta, note: input.note, createdBy: ctx.user.id })
        .returning();
      await this.tenant.audit(tx, ctx, { action: 'program.package_adjust', entity: 'program', entityId: id, after: row });
      return row;
    });
  }
}

