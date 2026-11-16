import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { auditLogs, branches, organizations, plans, subscriptions } from '@adiestra/db';
import { and, asc, desc, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import { policiesSchema } from '@adiestra/shared';
import { Ctx, RequestContext, RequirePermissions } from '../core/context';
import { FeaturesService } from '../core/features.service';
import { TenantService } from '../core/tenant.service';
import { parse } from '../core/zod';

const orgUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  legalName: z.string().trim().max(160).nullable().optional(),
  ruc: z
    .string()
    .trim()
    .regex(/^\d{5,9}-\d$/, 'RUC con formato 1234567-8')
    .nullable()
    .optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  timezone: z.string().trim().max(60).optional(),
  currency: z.enum(['PYG', 'USD', 'BRL', 'ARS']).optional(),
});

@Controller()
export class OrganizationController {
  constructor(
    private readonly tenant: TenantService,
    private readonly features: FeaturesService,
  ) {}

  @Get('organization')
  async get(@Ctx() ctx: RequestContext) {
    const data = await this.tenant.run(ctx, async (tx) => {
      const [org] = await tx.select().from(organizations);
      const [sub] = await tx
        .select({ status: subscriptions.status, trialEndsAt: subscriptions.trialEndsAt, currentPeriodEnd: subscriptions.currentPeriodEnd, plan: plans.name })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId));
      const branchList = await tx.select().from(branches).orderBy(desc(branches.isDefault), asc(branches.name));
      return { organization: org, subscription: sub ?? null, branches: branchList };
    });
    return { ...data, readOnly: ctx.org!.readOnly, features: await this.features.forOrganization(ctx.org!.id) };
  }

  @Patch('organization')
  @RequirePermissions('settings:update')
  update(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const input = parse(orgUpdateSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const [before] = await tx.select().from(organizations);
      const [row] = await tx.update(organizations).set(input).where(eq(organizations.id, ctx.org!.id)).returning();
      await this.tenant.audit(tx, ctx, { action: 'organization.update', entity: 'organization', entityId: row.id, before, after: row });
      return row;
    });
  }

  /** Políticas de la empresa: ausencias y anticipación para cancelar. */
  @Patch('organization/policies')
  @RequirePermissions('settings:update')
  policies(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const input = parse(policiesSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const [before] = await tx.select({ noShowConsumes: organizations.noShowConsumes, cancelHours: organizations.cancelHours }).from(organizations);
      const [row] = await tx.update(organizations).set(input).where(eq(organizations.id, ctx.org!.id)).returning();
      await this.tenant.audit(tx, ctx, { action: 'organization.policies', entity: 'organization', entityId: row.id, before, after: input });
      return row;
    });
  }

  @Get('audit')
  @RequirePermissions('audit:read')
  audit(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    const q = parse(z.object({ before: z.coerce.date().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }), query);
    return this.tenant.run(ctx, (tx) =>
      tx
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          entity: auditLogs.entity,
          entityId: auditLogs.entityId,
          actorName: auditLogs.actorName,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .where(q.before ? and(lt(auditLogs.createdAt, q.before)) : undefined)
        .orderBy(desc(auditLogs.createdAt))
        .limit(q.limit),
    );
  }
}
