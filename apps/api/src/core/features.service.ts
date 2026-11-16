import { Inject, Injectable } from '@nestjs/common';
import { Db, features, planFeatures, subscriptions } from '@adiestra/db';
import { and, eq } from 'drizzle-orm';
import { SYSTEM_DB } from './db.module';
import { AppError } from './errors';

export interface FeatureState {
  enabled: boolean;
  limit: number | null;
}

/** Funciones habilitadas por el plan de la empresa. Los límites se configuran en el panel SaaS. */
@Injectable()
export class FeaturesService {
  constructor(@Inject(SYSTEM_DB) private readonly db: Db) {}

  async forOrganization(organizationId: string): Promise<Record<string, FeatureState>> {
    const rows = await this.db
      .select({ code: features.code, enabled: planFeatures.enabled, limit: planFeatures.limitValue })
      .from(subscriptions)
      .innerJoin(planFeatures, eq(planFeatures.planId, subscriptions.planId))
      .innerJoin(features, eq(features.id, planFeatures.featureId))
      .where(eq(subscriptions.organizationId, organizationId));
    return Object.fromEntries(rows.map((r) => [r.code, { enabled: r.enabled, limit: r.limit }]));
  }

  async get(organizationId: string, code: string): Promise<FeatureState> {
    const [row] = await this.db
      .select({ enabled: planFeatures.enabled, limit: planFeatures.limitValue })
      .from(subscriptions)
      .innerJoin(planFeatures, eq(planFeatures.planId, subscriptions.planId))
      .innerJoin(features, and(eq(features.id, planFeatures.featureId), eq(features.code, code)))
      .where(eq(subscriptions.organizationId, organizationId));
    return row ? { enabled: row.enabled, limit: row.limit } : { enabled: false, limit: 0 };
  }

  /** Lanza 402 si agregar uno más supera el límite del plan. */
  async assertWithinLimit(organizationId: string, code: string, current: number, label: string) {
    const f = await this.get(organizationId, code);
    if (f.limit !== null && current + 1 > f.limit) {
      throw new AppError(402, 'PLAN_LIMIT', `Tu plan permite hasta ${f.limit} ${label}. Mejorá el plan para agregar más.`, {
        feature: code,
        limit: f.limit,
      });
    }
  }

  async assertEnabled(organizationId: string, code: string, label: string) {
    const f = await this.get(organizationId, code);
    if (!f.enabled) throw new AppError(402, 'FEATURE_DISABLED', `${label} no está incluido en tu plan`, { feature: code });
  }
}
