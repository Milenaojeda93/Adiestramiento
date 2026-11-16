import { Inject, Injectable } from '@nestjs/common';
import { Db, memberships, organizations, roles, sessions, subscriptions, users } from '@adiestra/db';
import { ALL_PERMISSIONS, isPermission, Permission } from '@adiestra/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { AppConfig, CONFIG } from './config';
import type { RequestContext } from './context';
import { SYSTEM_DB } from './db.module';

export const SESSION_COOKIE = 'adiestra_session';

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class SessionService {
  constructor(
    @Inject(SYSTEM_DB) private readonly db: Db,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  /** Crea una sesión y devuelve el token en claro (solo viaja en la cookie). */
  async create(userId: string, organizationId: string | null, meta: { ip?: string | null; userAgent?: string | null }) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.cfg.SESSION_DAYS * 24 * 3600 * 1000);
    await this.db.insert(sessions).values({
      userId,
      organizationId,
      tokenHash: sha256(token),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      expiresAt,
    });
    return { token, expiresAt };
  }

  async revoke(sessionId: string) {
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
  }

  async revokeAllForUser(userId: string) {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  async setOrganization(sessionId: string, organizationId: string | null, impersonating = false) {
    await this.db.update(sessions).set({ organizationId, impersonating }).where(eq(sessions.id, sessionId));
  }

  /** Resuelve el contexto completo a partir del token de la cookie. null = sesión inválida. */
  async resolve(token: string, ip: string | null): Promise<RequestContext | null> {
    const [row] = await this.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.tokenHash, sha256(token)));
    if (!row) return null;
    const { session, user } = row;
    if (session.revokedAt || session.expiresAt < new Date() || !user.active) return null;

    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
      await this.db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, session.id));
    }

    const ctx: RequestContext = {
      sessionId: session.id,
      user: { id: user.id, email: user.email, name: user.name, kind: user.kind, mustChangePassword: user.mustChangePassword },
      org: null,
      membership: null,
      impersonating: session.impersonating,
      ip,
    };

    if (!session.organizationId) return ctx;

    const [org] = await this.db
      .select({ org: organizations, sub: subscriptions })
      .from(organizations)
      .leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
      .where(eq(organizations.id, session.organizationId));
    if (!org) return ctx;

    ctx.org = {
      id: org.org.id,
      name: org.org.name,
      currency: org.org.currency,
      timezone: org.org.timezone,
      readOnly: this.isReadOnly(org.org.status, org.sub),
    };

    if (session.impersonating && user.kind === 'PLATFORM_ADMIN') {
      // Soporte: lectura de toda la empresa, sin poder modificar.
      ctx.org.readOnly = true;
      ctx.membership = {
        id: 'impersonation',
        roleId: 'impersonation',
        roleName: 'Soporte de plataforma',
        scopeOwn: false,
        branchIds: [],
        permissions: new Set<Permission>(ALL_PERMISSIONS.filter((p) => p.endsWith(':read'))),
      };
      return ctx;
    }

    const [m] = await this.db
      .select({ m: memberships, role: roles })
      .from(memberships)
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(and(eq(memberships.userId, user.id), eq(memberships.organizationId, session.organizationId), eq(memberships.active, true)));
    if (!m) {
      ctx.org = null; // ya no pertenece a esa empresa
      return ctx;
    }
    ctx.membership = {
      id: m.m.id,
      roleId: m.role.id,
      roleName: m.role.name,
      scopeOwn: m.role.scopeOwn,
      branchIds: m.m.branchIds,
      permissions: new Set(m.role.permissions.filter(isPermission)),
    };
    return ctx;
  }

  private isReadOnly(
    orgStatus: 'ACTIVE' | 'SUSPENDED',
    sub: { status: string; trialEndsAt: Date | null; currentPeriodEnd: Date | null } | null,
  ): boolean {
    if (orgStatus === 'SUSPENDED') return true;
    if (!sub) return true;
    if (sub.status === 'SUSPENDED' || sub.status === 'CANCELLED') return true;
    const grace = this.cfg.GRACE_DAYS * 24 * 3600 * 1000;
    const end = sub.status === 'TRIAL' ? sub.trialEndsAt : sub.currentPeriodEnd;
    if (end && end.getTime() + grace < Date.now()) return true;
    return false;
  }
}
