import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { auditLogs, Db, hashPassword, memberships, organizations, provisionOrganization, roles, users } from '@adiestra/db';
import { loginSchema, passwordSchema, signupSchema, switchOrgSchema } from '@adiestra/shared';
import { verify } from '@node-rs/argon2';
import { and, eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppConfig, CONFIG } from '../core/config';
import { AllowNoOrg, Ctx, Public, RequestContext } from '../core/context';
import { SYSTEM_DB } from '../core/db.module';
import { AppError } from '../core/errors';
import { FeaturesService } from '../core/features.service';
import { SESSION_COOKIE, SessionService } from '../core/session.service';
import { parse } from '../core/zod';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
/** Hash real de una contraseña descartable: si el correo no existe se verifica igual, así el tiempo de respuesta no delata qué correos están registrados. */
const DUMMY_HASH = hashPassword('cuenta-inexistente-' + Math.random());

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    @Inject(SYSTEM_DB) private readonly db: Db,
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly sessions: SessionService,
    private readonly features: FeaturesService,
  ) {}

  private setCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.cfg.NODE_ENV === 'production',
      expires: expiresAt,
      path: '/',
    });
  }

  private async systemAudit(organizationId: string | null, actor: { id: string; name: string } | null, action: string, ip: string | null, after?: unknown) {
    await this.db.insert(auditLogs).values({
      organizationId,
      actorUserId: actor?.id,
      actorName: actor?.name,
      action,
      ip,
      after: (after ?? null) as never,
    });
  }

  /** Alta de empresa con prueba gratuita. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  async signup(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const input = parse(signupSchema, body);
    try {
      const { organization, user } = await provisionOrganization(this.db, input);
      await this.systemAudit(organization.id, user, 'organization.signup', req.ip ?? null, { organization: organization.name });
      const { token, expiresAt } = await this.sessions.create(user.id, organization.id, { ip: req.ip, userAgent: req.headers['user-agent'] });
      this.setCookie(res, token, expiresAt);
      return { organizationId: organization.id, userId: user.id };
    } catch (e) {
      if ((e as { code?: string }).code === 'EMAIL_TAKEN') {
        throw new AppError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo. Iniciá sesión.');
      }
      throw e;
    }
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const input = parse(loginSchema, body);
    const invalid = new AppError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos');
    const [user] = await this.db.select().from(users).where(eq(users.email, input.email));

    if (!user) {
      await verify(await DUMMY_HASH, input.password).catch(() => false);
      throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(423, 'LOCKED', `Demasiados intentos fallidos. Probá de nuevo en ${LOCK_MINUTES} minutos.`);
    }
    const ok = await verify(user.passwordHash, input.password).catch(() => false);
    if (!ok || !user.active) {
      const failed = user.failedLogins + 1;
      await this.db
        .update(users)
        .set({ failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
        .where(eq(users.id, user.id));
      throw invalid;
    }

    await this.db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id));

    let orgId: string | null = null;
    if (user.kind === 'STAFF') {
      const [m] = await this.db
        .select({ organizationId: memberships.organizationId })
        .from(memberships)
        .where(and(eq(memberships.userId, user.id), eq(memberships.active, true)))
        .limit(1);
      if (!m) throw new AppError(403, 'NO_ORGANIZATION', 'Tu usuario no tiene acceso a ninguna empresa activa');
      orgId = m.organizationId;
    }

    const { token, expiresAt } = await this.sessions.create(user.id, orgId, { ip: req.ip, userAgent: req.headers['user-agent'] });
    this.setCookie(res, token, expiresAt);
    await this.systemAudit(orgId, user, 'auth.login', req.ip ?? null);
    return { kind: user.kind, organizationId: orgId, mustChangePassword: user.mustChangePassword };
  }

  @AllowNoOrg()
  @Post('logout')
  @HttpCode(204)
  async logout(@Ctx() ctx: RequestContext, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(ctx.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  /** Quién soy, en qué empresa estoy, qué puedo hacer y qué incluye mi plan. */
  @AllowNoOrg()
  @Get('me')
  async me(@Ctx() ctx: RequestContext) {
    const orgs = await this.db
      .select({ id: organizations.id, name: organizations.name, role: roles.name })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(and(eq(memberships.userId, ctx.user.id), eq(memberships.active, true)));
    return {
      user: ctx.user,
      organization: ctx.org,
      role: ctx.membership ? { id: ctx.membership.roleId, name: ctx.membership.roleName, scopeOwn: ctx.membership.scopeOwn } : null,
      permissions: ctx.membership ? [...ctx.membership.permissions] : [],
      features: ctx.org ? await this.features.forOrganization(ctx.org.id) : {},
      organizations: orgs,
      impersonating: ctx.impersonating,
    };
  }

  /** Cambiar de empresa activa: solo a una donde el usuario tenga membresía activa. */
  @AllowNoOrg()
  @Post('switch-organization')
  @HttpCode(200)
  async switchOrg(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const { organizationId } = parse(switchOrgSchema, body);
    const [m] = await this.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, ctx.user.id), eq(memberships.organizationId, organizationId), eq(memberships.active, true)));
    if (!m) throw new AppError(403, 'FORBIDDEN', 'No tenés acceso a esa empresa');
    await this.sessions.setOrganization(ctx.sessionId, organizationId);
    return { organizationId };
  }

  @AllowNoOrg()
  @Post('change-password')
  @HttpCode(204)
  async changePassword(@Ctx() ctx: RequestContext, @Body() body: unknown, @Req() req: Request) {
    const input = parse(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }), body);
    const [user] = await this.db.select().from(users).where(eq(users.id, ctx.user.id));
    if (!(await verify(user.passwordHash, input.currentPassword).catch(() => false))) {
      throw new AppError(400, 'INVALID_PASSWORD', 'La contraseña actual no es correcta');
    }
    if (input.currentPassword === input.newPassword) throw new AppError(400, 'SAME_PASSWORD', 'La nueva contraseña debe ser distinta');
    await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(input.newPassword), mustChangePassword: false })
      .where(eq(users.id, ctx.user.id));
    await this.systemAudit(ctx.org?.id ?? null, ctx.user, 'auth.password_changed', req.ip ?? null);
  }
}
