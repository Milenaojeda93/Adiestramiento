import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@adiestra/shared';
import { AppConfig, CONFIG } from './config';
import { ALLOW_NO_ORG, AuthedRequest, IS_PUBLIC, PERMISSIONS, PLATFORM_ONLY } from './context';
import { AppError } from './errors';
import { SESSION_COOKIE, SessionService } from './session.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Guard global. En cada petición:
 *  1. Protección CSRF: si el navegador manda Origin, debe ser el de la web.
 *  2. Resuelve la sesión desde la cookie y arma req.ctx.
 *  3. Exige empresa activa, permisos del rol y suscripción vigente para escribir.
 * La empresa activa sale SIEMPRE de la sesión del servidor, nunca de un parámetro del navegador.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const meta = <T>(key: string) => this.reflector.getAllAndOverride<T>(key, [context.getHandler(), context.getClass()]);

    if (!SAFE_METHODS.has(req.method)) {
      const origin = req.headers.origin;
      if (origin && origin !== this.cfg.WEB_ORIGIN) {
        throw new AppError(403, 'BAD_ORIGIN', 'Origen no permitido');
      }
    }

    if (meta<boolean>(IS_PUBLIC)) return true;

    const token = req.cookies?.[SESSION_COOKIE];
    if (!token || typeof token !== 'string') throw new AppError(401, 'UNAUTHENTICATED', 'Iniciá sesión para continuar');
    const ctx = await this.sessions.resolve(token, req.ip ?? null);
    if (!ctx) throw new AppError(401, 'UNAUTHENTICATED', 'Tu sesión venció. Iniciá sesión de nuevo');
    req.ctx = ctx;

    if (meta<boolean>(PLATFORM_ONLY)) {
      if (ctx.user.kind !== 'PLATFORM_ADMIN') throw new AppError(403, 'FORBIDDEN', 'Solo para administración de la plataforma');
      return true;
    }

    if (meta<boolean>(ALLOW_NO_ORG)) return true;

    if (!ctx.org || !ctx.membership) throw new AppError(403, 'NO_ORGANIZATION', 'Elegí una empresa para continuar');

    if (ctx.user.mustChangePassword) {
      throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Cambiá tu contraseña temporal para continuar');
    }

    if (!SAFE_METHODS.has(req.method) && ctx.org.readOnly) {
      throw new AppError(
        402,
        'READ_ONLY',
        ctx.impersonating
          ? 'El modo soporte es solo de lectura'
          : 'La suscripción está vencida o suspendida: podés consultar tus datos, pero no modificarlos',
      );
    }
    const required = meta<Permission[]>(PERMISSIONS) ?? [];
    const missing = required.filter((p) => !ctx.membership!.permissions.has(p));
    if (missing.length) throw new AppError(403, 'FORBIDDEN', 'No tenés permiso para esta acción', { missing });

    return true;
  }
}
