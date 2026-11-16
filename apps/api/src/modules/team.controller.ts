import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { auditLogs, branches, Db, hashPassword, memberships, roles, users } from '@adiestra/db';
import { ACTIONS, inviteUserSchema, MODULES, roleSchema } from '@adiestra/shared';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, RequestContext, RequirePermissions } from '../core/context';
import { SYSTEM_DB } from '../core/db.module';
import { AppError, notFound } from '../core/errors';
import { FeaturesService } from '../core/features.service';
import { TenantService } from '../core/tenant.service';
import { parse } from '../core/zod';

const membershipUpdateSchema = z.object({
  roleId: z.string().uuid().optional(),
  branchIds: z.array(z.string().uuid()).optional(),
  active: z.boolean().optional(),
});

@Controller()
export class TeamController {
  constructor(
    private readonly tenant: TenantService,
    private readonly features: FeaturesService,
    @Inject(SYSTEM_DB) private readonly system: Db,
  ) {}

  // ─────────────── Usuarios del equipo ───────────────

  @Get('users')
  @RequirePermissions('users:read')
  listUsers(@Ctx() ctx: RequestContext) {
    return this.tenant.run(ctx, (tx) =>
      tx
        .select({
          membershipId: memberships.id,
          userId: users.id,
          name: users.name,
          email: users.email,
          lastLoginAt: users.lastLoginAt,
          active: memberships.active,
          branchIds: memberships.branchIds,
          role: { id: roles.id, name: roles.name, key: roles.key },
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .innerJoin(roles, eq(roles.id, memberships.roleId))
        .orderBy(asc(users.name)),
    );
  }

  /**
   * Alta de un usuario del equipo con contraseña temporal (debe cambiarla al ingresar).
   * Cuando el canal de correo esté configurado, se reemplaza por una invitación con link.
   */
  @Post('users')
  @RequirePermissions('users:create')
  async invite(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const input = parse(inviteUserSchema, body);
    const orgId = ctx.org!.id;

    // Validaciones con RLS: el rol y las sucursales tienen que ser de esta empresa.
    const role = await this.tenant.run(ctx, async (tx) => {
      const [r] = await tx.select().from(roles).where(eq(roles.id, input.roleId));
      if (!r) throw new AppError(400, 'INVALID_ROLE', 'El rol no existe');
      if (input.branchIds.length) {
        const found = await tx.select({ id: branches.id }).from(branches);
        const ok = new Set(found.map((b) => b.id));
        if (input.branchIds.some((b) => !ok.has(b))) throw new AppError(400, 'INVALID_BRANCH', 'Sucursal no válida');
      }
      if (r.key === 'trainer') {
        const [{ n }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(memberships)
          .where(and(eq(memberships.roleId, r.id), eq(memberships.active, true)));
        await this.features.assertWithinLimit(orgId, 'trainers.max', n, 'entrenadores');
      }
      return r;
    });

    return this.system.transaction(async (tx) => {
      let [user] = await tx.select().from(users).where(eq(users.email, input.email));
      if (user && user.kind !== 'STAFF') throw new AppError(409, 'EMAIL_TAKEN', 'Ese correo pertenece a otro tipo de cuenta');
      if (!user) {
        [user] = await tx
          .insert(users)
          .values({ email: input.email, name: input.name, passwordHash: await hashPassword(input.temporaryPassword), mustChangePassword: true })
          .returning();
      }
      const [exists] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.userId, user.id), eq(memberships.organizationId, orgId)));
      if (exists) throw new AppError(409, 'ALREADY_MEMBER', 'Esa persona ya es parte del equipo');
      const [m] = await tx
        .insert(memberships)
        .values({ organizationId: orgId, userId: user.id, roleId: role.id, branchIds: input.branchIds })
        .returning();
      await tx.insert(auditLogs).values({
        organizationId: orgId,
        actorUserId: ctx.user.id,
        actorName: ctx.user.name,
        action: 'user.invite',
        entity: 'membership',
        entityId: m.id,
        after: { email: user.email, role: role.name } as never,
        ip: ctx.ip,
      });
      return { membershipId: m.id, userId: user.id, email: user.email, name: user.name, role: { id: role.id, name: role.name } };
    });
  }

  @Patch('users/:membershipId')
  @RequirePermissions('users:update')
  async updateMember(@Ctx() ctx: RequestContext, @Param('membershipId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(membershipUpdateSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const [before] = await tx.select().from(memberships).where(eq(memberships.id, id));
      if (!before) throw notFound('Usuario');
      if (before.userId === ctx.user.id && (input.active === false || input.roleId)) {
        throw new AppError(400, 'SELF_CHANGE', 'No podés cambiar tu propio rol ni desactivarte');
      }
      if (input.roleId) {
        const [r] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.id, input.roleId));
        if (!r) throw new AppError(400, 'INVALID_ROLE', 'El rol no existe');
      }
      // Siempre debe quedar al menos un administrador activo.
      const [adminRole] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.key, 'admin'));
      if (adminRole && before.roleId === adminRole.id && (input.active === false || (input.roleId && input.roleId !== adminRole.id))) {
        const [{ n }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(memberships)
          .where(and(eq(memberships.roleId, adminRole.id), eq(memberships.active, true), ne(memberships.id, id)));
        if (n === 0) throw new AppError(400, 'LAST_ADMIN', 'Tiene que quedar al menos un administrador activo');
      }
      const [row] = await tx.update(memberships).set(input).where(eq(memberships.id, id)).returning();
      await this.tenant.audit(tx, ctx, { action: 'user.update', entity: 'membership', entityId: id, before, after: row });
      return row;
    });
  }

  // ─────────────── Roles y permisos ───────────────

  @Get('roles/catalog')
  @RequirePermissions('roles:read')
  catalog() {
    return { modules: MODULES, actions: ACTIONS };
  }

  @Get('roles')
  @RequirePermissions('roles:read')
  listRoles(@Ctx() ctx: RequestContext) {
    return this.tenant.run(ctx, (tx) => tx.select().from(roles).orderBy(asc(roles.isSystem), asc(roles.name)));
  }

  @Post('roles')
  @RequirePermissions('roles:create')
  createRole(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const input = parse(roleSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const [row] = await tx
        .insert(roles)
        .values({ ...input, organizationId: ctx.org!.id, isSystem: false })
        .returning();
      await this.tenant.audit(tx, ctx, { action: 'role.create', entity: 'role', entityId: row.id, after: row });
      return row;
    });
  }

  @Patch('roles/:id')
  @RequirePermissions('roles:update')
  updateRole(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(roleSchema.partial(), body);
    return this.tenant.run(ctx, async (tx) => {
      const [before] = await tx.select().from(roles).where(eq(roles.id, id));
      if (!before) throw notFound('Rol');
      if (before.key === 'admin') throw new AppError(400, 'ADMIN_LOCKED', 'El rol Administrador no se puede modificar');
      const [row] = await tx.update(roles).set(input).where(eq(roles.id, id)).returning();
      await this.tenant.audit(tx, ctx, { action: 'role.update', entity: 'role', entityId: id, before, after: row });
      return row;
    });
  }
}
