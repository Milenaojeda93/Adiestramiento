import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@adiestra/shared';
import type { Request } from 'express';

/** Todo lo que la API sabe de quién hace la petición. Lo arma AuthGuard desde la sesión. */
export interface RequestContext {
  sessionId: string;
  user: { id: string; email: string; name: string; kind: 'STAFF' | 'OWNER' | 'PLATFORM_ADMIN'; mustChangePassword: boolean };
  /** Empresa activa. null para el superadministrador fuera de una empresa. */
  org: null | {
    id: string;
    name: string;
    currency: string;
    timezone: string;
    /** true = suscripción vencida o empresa suspendida: solo se permite leer. */
    readOnly: boolean;
  };
  membership: null | {
    id: string;
    roleId: string;
    roleName: string;
    scopeOwn: boolean;
    branchIds: string[];
    permissions: Set<Permission>;
  };
  impersonating: boolean;
  ip: string | null;
}

export type AuthedRequest = Request & { ctx?: RequestContext };

export const Ctx = createParamDecorator((_: unknown, host: ExecutionContext): RequestContext => {
  const req = host.switchToHttp().getRequest<AuthedRequest>();
  if (!req.ctx) throw new Error('Contexto ausente: falta AuthGuard');
  return req.ctx;
});

export const IS_PUBLIC = 'isPublic';
/** Ruta sin sesión (login, alta de empresa). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSIONS = 'permissions';
/** Requiere todos los permisos indicados dentro de la empresa activa. */
export const RequirePermissions = (...perms: Permission[]) => SetMetadata(PERMISSIONS, perms);

export const PLATFORM_ONLY = 'platformOnly';
/** Solo superadministradores de la plataforma. */
export const PlatformOnly = () => SetMetadata(PLATFORM_ONLY, true);

export const ALLOW_NO_ORG = 'allowNoOrg';
/** Ruta autenticada que no necesita empresa activa (ej. /auth/me, cambiar empresa). */
export const AllowNoOrg = () => SetMetadata(ALLOW_NO_ORG, true);
