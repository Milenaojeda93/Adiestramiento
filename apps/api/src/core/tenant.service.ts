import { Inject, Injectable } from '@nestjs/common';
import { auditLogs, Db, Tx, withTenant } from '@adiestra/db';
import type { RequestContext } from './context';
import { APP_DB } from './db.module';
import { AppError } from './errors';

export interface AuditEntry {
  action: string;
  entity?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Única puerta de acceso a datos de una empresa.
 * Abre una transacción con el rol de la app y app.org_id fijado: PostgreSQL (RLS)
 * garantiza que ninguna consulta vea o modifique filas de otra empresa.
 */
@Injectable()
export class TenantService {
  constructor(@Inject(APP_DB) private readonly db: Db) {}

  run<T>(ctx: RequestContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!ctx.org) throw new AppError(403, 'NO_ORGANIZATION', 'Elegí una empresa para continuar');
    return withTenant(this.db, ctx.org.id, fn);
  }

  /** Registra en auditoría dentro de la misma transacción: si la operación falla, no queda registro. */
  async audit(tx: Tx, ctx: RequestContext, entry: AuditEntry) {
    await tx.insert(auditLogs).values({
      organizationId: ctx.org!.id,
      actorUserId: ctx.user.id,
      actorName: ctx.user.name,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: (entry.before ?? null) as never,
      after: (entry.after ?? null) as never,
      ip: ctx.ip,
    });
  }
}
