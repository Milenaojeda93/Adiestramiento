import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { clients } from '@adiestra/db';
import { clientSchema, clientUpdateSchema, listQuerySchema } from '@adiestra/shared';
import { and, desc, eq, ilike, isNull, lt, or, SQL, sql } from 'drizzle-orm';
import { Ctx, RequestContext, RequirePermissions } from '../core/context';
import { notFound } from '../core/errors';
import { TenantService } from '../core/tenant.service';
import { parse } from '../core/zod';

/**
 * Clientes / propietarios.
 * Ninguna consulta filtra por organization_id a mano: lo hace PostgreSQL vía RLS
 * dentro de TenantService.run. Los filtros de acá son solo de negocio.
 *
 * Pendiente Sprint 2: el rol Entrenador (scopeOwn) verá solo los clientes de sus
 * mascotas asignadas, cuando existan mascotas y programas.
 */
@Controller('clients')
export class ClientsController {
  constructor(private readonly tenant: TenantService) {}

  @Get()
  @RequirePermissions('clients:read')
  async list(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    const q = parse(listQuerySchema, query);
    return this.tenant.run(ctx, async (tx) => {
      const where: SQL[] = [isNull(clients.deletedAt)];
      if (q.status !== 'ALL') where.push(eq(clients.status, q.status));
      if (q.search) {
        const term = `%${q.search.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
        const digits = q.search.replace(/\D/g, '');
        const conds = [
          ilike(clients.firstName, term),
          ilike(clients.lastName, term),
          ilike(sql`${clients.firstName} || ' ' || ${clients.lastName}`, term),
          ilike(clients.documentId, term),
        ];
        if (digits.length >= 3) conds.push(ilike(clients.phone, `%${digits}%`));
        where.push(or(...conds)!);
      }
      const base = [...where];
      if (q.cursor) {
        const [c] = await tx.select({ createdAt: clients.createdAt }).from(clients).where(eq(clients.id, q.cursor));
        if (c) {
          where.push(or(lt(clients.createdAt, c.createdAt), and(eq(clients.createdAt, c.createdAt), lt(clients.id, q.cursor)))!);
        }
      }
      const rows = await tx
        .select()
        .from(clients)
        .where(and(...where))
        .orderBy(desc(clients.createdAt), desc(clients.id))
        .limit(q.limit + 1);
      const hasMore = rows.length > q.limit;
      const items = rows.slice(0, q.limit);
      const [{ total }] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(clients)
        .where(and(...base));
      return { items, nextCursor: hasMore ? items[items.length - 1].id : null, total };
    });
  }

  @Get(':id')
  @RequirePermissions('clients:read')
  async get(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenant.run(ctx, async (tx) => {
      const [row] = await tx.select().from(clients).where(and(eq(clients.id, id), isNull(clients.deletedAt)));
      if (!row) throw notFound('Cliente');
      return row;
    });
  }

  @Post()
  @RequirePermissions('clients:create')
  async create(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const input = parse(clientSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const [row] = await tx
        .insert(clients)
        .values({ ...input, whatsapp: input.whatsapp ?? input.phone, organizationId: ctx.org!.id, createdBy: ctx.user.id })
        .returning();
      await this.tenant.audit(tx, ctx, { action: 'client.create', entity: 'client', entityId: row.id, after: row });
      return row;
    });
  }

  @Patch(':id')
  @RequirePermissions('clients:update')
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(clientUpdateSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const [before] = await tx.select().from(clients).where(and(eq(clients.id, id), isNull(clients.deletedAt)));
      if (!before) throw notFound('Cliente');
      const [row] = await tx.update(clients).set(input).where(eq(clients.id, id)).returning();
      await this.tenant.audit(tx, ctx, {
        action: input.status && input.status !== before.status ? `client.${input.status === 'INACTIVE' ? 'deactivate' : 'activate'}` : 'client.update',
        entity: 'client',
        entityId: id,
        before,
        after: row,
      });
      return row;
    });
  }

  /** Desactivar (no se borra: conserva su historial). */
  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermissions('clients:update')
  deactivate(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.update(ctx, id, { status: 'INACTIVE' });
  }
}
