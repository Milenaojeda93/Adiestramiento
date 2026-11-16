import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { assessments, clients, petGuardians, pets, programs, trainingSessions } from '@adiestra/db';
import { guardianSchema, listQuerySchema, petSchema, petUpdateSchema } from '@adiestra/shared';
import { and, asc, desc, eq, ilike, isNull, lt, or, SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, RequestContext, RequirePermissions } from '../core/context';
import { AppError, notFound } from '../core/errors';
import { col, likeTerm, ownPetsCondition } from '../core/scope';
import { TenantService } from '../core/tenant.service';
import { parse } from '../core/zod';

const petListQuery = listQuerySchema.extend({ clientId: z.string().uuid().optional() });

/** Nombre de los propietarios titulares de cada mascota, para listados. */
const ownersAgg = sql<string | null>`(
  select string_agg(c.first_name || ' ' || c.last_name, ', ' order by c.last_name)
  from pet_guardians g join clients c on c.id = g.client_id
  where g.pet_id = ${col(pets.id)} and g.role = 'OWNER')`;

@Controller('pets')
export class PetsController {
  constructor(private readonly tenant: TenantService) {}

  @Get()
  @RequirePermissions('pets:read')
  list(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    const q = parse(petListQuery, query);
    return this.tenant.run(ctx, async (tx) => {
      const where: SQL[] = [isNull(pets.deletedAt)];
      if (q.status !== 'ALL') where.push(eq(pets.status, q.status));
      const scope = ownPetsCondition(ctx, pets.id);
      if (scope) where.push(scope);
      if (q.clientId) where.push(sql`exists (select 1 from pet_guardians g where g.pet_id = ${col(pets.id)} and g.client_id = ${q.clientId})`);
      if (q.search) {
        const t = likeTerm(q.search);
        where.push(
          or(
            ilike(pets.name, t),
            ilike(pets.breed, t),
            sql`exists (select 1 from pet_guardians g join clients c on c.id = g.client_id
                        where g.pet_id = ${col(pets.id)} and (c.first_name || ' ' || c.last_name) ilike ${t})`,
          )!,
        );
      }
      const base = [...where];
      if (q.cursor) {
        const [c] = await tx.select({ createdAt: pets.createdAt }).from(pets).where(eq(pets.id, q.cursor));
        if (c) where.push(or(lt(pets.createdAt, c.createdAt), and(eq(pets.createdAt, c.createdAt), lt(pets.id, q.cursor)))!);
      }
      const rows = await tx
        .select({
          id: pets.id,
          name: pets.name,
          species: pets.species,
          breed: pets.breed,
          sex: pets.sex,
          birthDate: pets.birthDate,
          size: pets.size,
          alerts: pets.alerts,
          status: pets.status,
          isDemo: pets.isDemo,
          createdAt: pets.createdAt,
          owners: ownersAgg,
          activeProgram: sql<string | null>`(select s.name from programs p join services s on s.id = p.service_id
                                               where p.pet_id = ${col(pets.id)} and p.status = 'ACTIVE' order by p.start_date desc limit 1)`,
        })
        .from(pets)
        .where(and(...where))
        .orderBy(desc(pets.createdAt), desc(pets.id))
        .limit(q.limit + 1);
      const [{ total }] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(pets)
        .where(and(...base));
      const hasMore = rows.length > q.limit;
      const items = rows.slice(0, q.limit);
      return { items, nextCursor: hasMore ? items[items.length - 1].id : null, total };
    });
  }

  @Get(':id')
  @RequirePermissions('pets:read')
  get(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenant.run(ctx, async (tx) => {
      const scope = ownPetsCondition(ctx, pets.id);
      const [pet] = await tx
        .select()
        .from(pets)
        .where(and(eq(pets.id, id), isNull(pets.deletedAt), scope));
      if (!pet) throw notFound('Mascota');
      const guardians = await tx
        .select({
          id: petGuardians.id,
          role: petGuardians.role,
          canPickUp: petGuardians.canPickUp,
          client: { id: clients.id, firstName: clients.firstName, lastName: clients.lastName, phone: clients.phone, whatsapp: clients.whatsapp, email: clients.email },
        })
        .from(petGuardians)
        .innerJoin(clients, eq(clients.id, petGuardians.clientId))
        .where(eq(petGuardians.petId, id))
        .orderBy(asc(petGuardians.role), asc(clients.lastName));
      const [counts] = await tx
        .select({
          assessments: sql<number>`(select count(*)::int from ${assessments} a where a.pet_id = ${id})`,
          programs: sql<number>`(select count(*)::int from ${programs} p where p.pet_id = ${id})`,
          sessionsDone: sql<number>`(select count(*)::int from ${trainingSessions} s where s.pet_id = ${id} and s.status = 'DONE')`,
        })
        .from(sql`(select 1) x`);
      return { ...pet, guardians, counts };
    });
  }

  @Post()
  @RequirePermissions('pets:create')
  create(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const { ownerClientId, ...input } = parse(petSchema, body);
    if (!ownerClientId) throw new AppError(400, 'VALIDATION', 'Elegí el propietario', [{ field: 'ownerClientId', message: 'Elegí el propietario' }]);
    return this.tenant.run(ctx, async (tx) => {
      const [owner] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, ownerClientId), isNull(clients.deletedAt)));
      if (!owner) throw new AppError(400, 'INVALID_CLIENT', 'El propietario no existe');
      const [pet] = await tx
        .insert(pets)
        .values({ ...input, joinedAt: input.joinedAt ?? undefined, organizationId: ctx.org!.id, createdBy: ctx.user.id })
        .returning();
      await tx.insert(petGuardians).values({ organizationId: ctx.org!.id, petId: pet.id, clientId: ownerClientId, role: 'OWNER' });
      await this.tenant.audit(tx, ctx, { action: 'pet.create', entity: 'pet', entityId: pet.id, after: pet });
      return pet;
    });
  }

  @Patch(':id')
  @RequirePermissions('pets:update')
  update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(petUpdateSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const [before] = await tx
        .select()
        .from(pets)
        .where(and(eq(pets.id, id), isNull(pets.deletedAt), ownPetsCondition(ctx, pets.id)));
      if (!before) throw notFound('Mascota');
      const patch = { ...input, joinedAt: input.joinedAt ?? undefined };
      const [row] = await tx.update(pets).set(patch).where(eq(pets.id, id)).returning();
      const action = input.health ? 'pet.health_update' : input.behavior ? 'pet.behavior_update' : input.status ? `pet.${input.status === 'INACTIVE' ? 'deactivate' : 'activate'}` : 'pet.update';
      await this.tenant.audit(tx, ctx, { action, entity: 'pet', entityId: id, before, after: row });
      return row;
    });
  }

  @Post(':id/guardians')
  @RequirePermissions('pets:update')
  addGuardian(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(guardianSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const [pet] = await tx.select({ id: pets.id }).from(pets).where(and(eq(pets.id, id), isNull(pets.deletedAt)));
      if (!pet) throw notFound('Mascota');
      const [client] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, input.clientId));
      if (!client) throw new AppError(400, 'INVALID_CLIENT', 'El cliente no existe');
      const [row] = await tx
        .insert(petGuardians)
        .values({ ...input, organizationId: ctx.org!.id, petId: id })
        .returning();
      await this.tenant.audit(tx, ctx, { action: 'pet.guardian_add', entity: 'pet', entityId: id, after: row });
      return row;
    });
  }

  @Delete(':id/guardians/:guardianId')
  @HttpCode(204)
  @RequirePermissions('pets:update')
  removeGuardian(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('guardianId', ParseUUIDPipe) guardianId: string) {
    return this.tenant.run(ctx, async (tx) => {
      const [g] = await tx
        .select()
        .from(petGuardians)
        .where(and(eq(petGuardians.id, guardianId), eq(petGuardians.petId, id)));
      if (!g) throw notFound('Responsable');
      if (g.role === 'OWNER') {
        const [{ n }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(petGuardians)
          .where(and(eq(petGuardians.petId, id), eq(petGuardians.role, 'OWNER')));
        if (n <= 1) throw new AppError(400, 'LAST_OWNER', 'La mascota tiene que tener al menos un propietario titular');
      }
      await tx.delete(petGuardians).where(eq(petGuardians.id, guardianId));
      await this.tenant.audit(tx, ctx, { action: 'pet.guardian_remove', entity: 'pet', entityId: id, before: g });
    });
  }
}
