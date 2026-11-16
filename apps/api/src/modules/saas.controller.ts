import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { auditLogs, clients, Db, features, memberships, organizations, planFeatures, plans, subscriptions } from '@adiestra/db';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AllowNoOrg, Ctx, PlatformOnly, RequestContext } from '../core/context';
import { SYSTEM_DB } from '../core/db.module';
import { AppError, notFound } from '../core/errors';
import { SessionService } from '../core/session.service';
import { parse } from '../core/zod';

const orgAdminSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  planId: z.string().uuid().optional(),
  subscriptionStatus: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED']).optional(),
  trialEndsAt: z.coerce.date().nullable().optional(),
  currentPeriodEnd: z.coerce.date().nullable().optional(),
});

/** Pago de suscripción cargado a mano. No hay cobro real hasta integrar una pasarela. */
const manualPaymentSchema = z.object({
  paidAt: z.coerce.date(),
  periodEnd: z.coerce.date(),
  note: z.string().trim().min(3, 'Indicá el medio y la referencia del pago').max(300),
});

const planFeatureSchema = z.object({
  features: z.array(z.object({ featureId: z.string().uuid(), enabled: z.boolean(), limitValue: z.number().int().min(0).nullable() })),
});

/**
 * Panel central de la plataforma. Solo superadministradores.
 * Usa el cliente de sistema porque necesita ver todas las empresas; cada acción queda auditada.
 */
@Controller('saas')
@PlatformOnly()
export class SaasController {
  constructor(
    @Inject(SYSTEM_DB) private readonly db: Db,
    private readonly sessions: SessionService,
  ) {}

  private audit(ctx: RequestContext, organizationId: string | null, action: string, after?: unknown) {
    return this.db.insert(auditLogs).values({
      organizationId,
      actorUserId: ctx.user.id,
      actorName: `${ctx.user.name} (plataforma)`,
      action,
      after: (after ?? null) as never,
      ip: ctx.ip,
    });
  }

  @Get('metrics')
  async metrics() {
    const [row] = await this.db.execute<{ active: number; trial: number; suspended: number; users: number; clients: number }>(sql`
      select
        (select count(*)::int from organizations o join subscriptions s on s.organization_id = o.id where o.status = 'ACTIVE' and s.status = 'ACTIVE') as active,
        (select count(*)::int from subscriptions where status = 'TRIAL') as trial,
        (select count(*)::int from organizations where status = 'SUSPENDED') as suspended,
        (select count(*)::int from memberships where active) as users,
        (select count(*)::int from clients where deleted_at is null) as clients
    `).then((r) => r.rows);
    return row;
  }

  @Get('organizations')
  list() {
    return this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        email: organizations.email,
        status: organizations.status,
        isDemo: organizations.isDemo,
        createdAt: organizations.createdAt,
        plan: { id: plans.id, name: plans.name, code: plans.code },
        subscription: {
          status: subscriptions.status,
          trialEndsAt: subscriptions.trialEndsAt,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          lastPaymentAt: subscriptions.lastPaymentAt,
          lastPaymentNote: subscriptions.lastPaymentNote,
        },
        users: sql<number>`(select count(*)::int from ${memberships} m where m.organization_id = ${organizations.id} and m.active)`,
        clients: sql<number>`(select count(*)::int from ${clients} c where c.organization_id = ${organizations.id} and c.deleted_at is null)`,
      })
      .from(organizations)
      .leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .orderBy(desc(organizations.createdAt));
  }

  @Patch('organizations/:id')
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(orgAdminSchema, body);
    return this.db.transaction(async (tx) => {
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, id));
      if (!org) throw notFound('Empresa');
      if (input.status) await tx.update(organizations).set({ status: input.status }).where(eq(organizations.id, id));
      const subPatch: Partial<typeof subscriptions.$inferInsert> = {};
      if (input.planId) subPatch.planId = input.planId;
      if (input.subscriptionStatus) subPatch.status = input.subscriptionStatus;
      if (input.trialEndsAt !== undefined) subPatch.trialEndsAt = input.trialEndsAt;
      if (input.currentPeriodEnd !== undefined) subPatch.currentPeriodEnd = input.currentPeriodEnd;
      if (Object.keys(subPatch).length) await tx.update(subscriptions).set(subPatch).where(eq(subscriptions.organizationId, id));
      await tx.insert(auditLogs).values({
        organizationId: id,
        actorUserId: ctx.user.id,
        actorName: `${ctx.user.name} (plataforma)`,
        action: 'saas.organization_update',
        after: input as never,
        ip: ctx.ip,
      });
      return { ok: true };
    });
  }

  @Post('organizations/:id/payments')
  async registerPayment(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(manualPaymentSchema, body);
    const [sub] = await this.db
      .update(subscriptions)
      .set({ status: 'ACTIVE', lastPaymentAt: input.paidAt, lastPaymentNote: `Registrado a mano: ${input.note}`, currentPeriodEnd: input.periodEnd })
      .where(eq(subscriptions.organizationId, id))
      .returning();
    if (!sub) throw notFound('Suscripción');
    await this.audit(ctx, id, 'saas.manual_payment', input);
    return sub;
  }

  @Get('plans')
  async plans() {
    const all = await this.db.select().from(plans).orderBy(asc(plans.sortOrder));
    const feats = await this.db.select().from(features).orderBy(asc(features.code));
    const links = await this.db.select().from(planFeatures);
    return {
      features: feats,
      plans: all.map((p) => ({ ...p, features: links.filter((l) => l.planId === p.id) })),
    };
  }

  @Patch('plans/:id/features')
  async setPlanFeatures(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(planFeatureSchema, body);
    await this.db.transaction(async (tx) => {
      await tx.delete(planFeatures).where(eq(planFeatures.planId, id));
      if (input.features.length) await tx.insert(planFeatures).values(input.features.map((f) => ({ ...f, planId: id })));
    });
    await this.audit(ctx, null, 'saas.plan_features_update', { planId: id, ...input });
    return { ok: true };
  }

  /** Modo soporte: entrar a una empresa en solo lectura. Exige motivo y queda auditado en esa empresa. */
  @Post('organizations/:id/support')
  @HttpCode(200)
  async startSupport(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { reason } = parse(z.object({ reason: z.string().trim().min(10, 'Explicá el motivo (mínimo 10 caracteres)').max(300) }), body);
    const [org] = await this.db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, id));
    if (!org) throw notFound('Empresa');
    await this.sessions.setOrganization(ctx.sessionId, id, true);
    await this.audit(ctx, id, 'saas.support_start', { reason });
    return { organizationId: id, readOnly: true };
  }

  @Post('support/exit')
  @HttpCode(200)
  @AllowNoOrg()
  async exitSupport(@Ctx() ctx: RequestContext) {
    if (!ctx.impersonating) throw new AppError(400, 'NOT_IN_SUPPORT', 'No estás en modo soporte');
    await this.audit(ctx, ctx.org?.id ?? null, 'saas.support_end');
    await this.sessions.setOrganization(ctx.sessionId, null, false);
    return { ok: true };
  }
}
