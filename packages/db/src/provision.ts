import { hash } from '@node-rs/argon2';
import { BASE_ROLES } from '@adiestra/shared';
import { eq } from 'drizzle-orm';
import type { Db } from './index';
import { branches, features, memberships, organizations, planFeatures, plans, roles, subscriptions, users } from './schema';

/** Parámetros de argon2id (OWASP 2024: m=19 MiB, t=2, p=1). */
export const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string) {
  return hash(password, ARGON2_OPTIONS);
}

export const TRIAL_DAYS = 14;

export const FEATURE_CATALOG = [
  { code: 'trainers.max', name: 'Entrenadores', kind: 'limit' as const },
  { code: 'branches.max', name: 'Sucursales', kind: 'limit' as const },
  { code: 'storage.mb', name: 'Almacenamiento (MB)', kind: 'limit' as const },
  { code: 'finance.enabled', name: 'Gestión financiera', kind: 'boolean' as const },
  { code: 'reports.enabled', name: 'Reportes', kind: 'boolean' as const },
  { code: 'documents.enabled', name: 'Documentos y contratos', kind: 'boolean' as const },
  { code: 'groups.enabled', name: 'Clases grupales', kind: 'boolean' as const },
  { code: 'notifications.enabled', name: 'Notificaciones', kind: 'boolean' as const },
  { code: 'portal.enabled', name: 'Portal del propietario', kind: 'boolean' as const },
  { code: 'boarding.enabled', name: 'Alojamiento', kind: 'boolean' as const },
  { code: 'branding.enabled', name: 'Personalización de marca', kind: 'boolean' as const },
];

/** Planes de ejemplo de la especificación. Precios a definir: quedan en 0 hasta que el negocio los fije. */
export const PLAN_CATALOG: { code: string; name: string; sortOrder: number; features: Record<string, number | boolean | null> }[] = [
  {
    code: 'inicial',
    name: 'Plan Inicial',
    sortOrder: 1,
    features: { 'trainers.max': 1, 'branches.max': 1, 'storage.mb': 2048 },
  },
  {
    code: 'profesional',
    name: 'Plan Profesional',
    sortOrder: 2,
    features: {
      'trainers.max': 5,
      'branches.max': 1,
      'storage.mb': 10240,
      'finance.enabled': true,
      'reports.enabled': true,
      'documents.enabled': true,
      'groups.enabled': true,
      'notifications.enabled': true,
    },
  },
  {
    code: 'empresarial',
    name: 'Plan Empresarial',
    sortOrder: 3,
    features: {
      'trainers.max': null,
      'branches.max': null,
      'storage.mb': 51200,
      'finance.enabled': true,
      'reports.enabled': true,
      'documents.enabled': true,
      'groups.enabled': true,
      'notifications.enabled': true,
      'portal.enabled': true,
      'boarding.enabled': true,
      'branding.enabled': true,
    },
  },
];

/** Crea o actualiza el catálogo de funciones y planes. Idempotente. */
export async function seedCatalog(db: Db) {
  for (const f of FEATURE_CATALOG) {
    await db.insert(features).values(f).onConflictDoUpdate({ target: features.code, set: { name: f.name, kind: f.kind } });
  }
  const allFeatures = await db.select().from(features);
  for (const p of PLAN_CATALOG) {
    const [plan] = await db
      .insert(plans)
      .values({ code: p.code, name: p.name, priceMonthly: 0, sortOrder: p.sortOrder })
      .onConflictDoUpdate({ target: plans.code, set: { name: p.name, sortOrder: p.sortOrder } })
      .returning();
    await db.delete(planFeatures).where(eq(planFeatures.planId, plan.id));
    for (const f of allFeatures) {
      const v = p.features[f.code];
      if (v === undefined) continue;
      await db.insert(planFeatures).values({
        planId: plan.id,
        featureId: f.id,
        enabled: v !== false,
        limitValue: typeof v === 'number' ? v : null,
      });
    }
  }
}

export interface ProvisionInput {
  organizationName: string;
  ownerName: string;
  email: string;
  password: string;
  phone?: string;
  planCode?: string;
  isDemo?: boolean;
}

/**
 * Alta de una empresa nueva: empresa, suscripción de prueba, sucursal principal,
 * roles base y el usuario administrador. Todo en una transacción.
 * Debe ejecutarse con el cliente de sistema (rol dueño).
 */
export async function provisionOrganization(db: Db, input: ProvisionInput) {
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const planCode = input.planCode ?? 'profesional';
    const [plan] = await tx.select().from(plans).where(eq(plans.code, planCode));
    if (!plan) throw new Error(`No existe el plan ${planCode}. Ejecutá el seed del catálogo.`);

    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (existing) {
      const err = new Error('Ya existe una cuenta con ese correo') as Error & { code: string };
      err.code = 'EMAIL_TAKEN';
      throw err;
    }

    const [org] = await tx
      .insert(organizations)
      .values({ name: input.organizationName, email: input.email, phone: input.phone, isDemo: input.isDemo ?? false })
      .returning();

    await tx.insert(subscriptions).values({
      organizationId: org.id,
      planId: plan.id,
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 3600 * 1000),
    });

    const [branch] = await tx
      .insert(branches)
      .values({ organizationId: org.id, name: 'Sede principal', isDefault: true })
      .returning();

    const createdRoles = await tx
      .insert(roles)
      .values(
        BASE_ROLES.map((r) => ({
          organizationId: org.id,
          key: r.key,
          name: r.name,
          description: r.description,
          scopeOwn: r.scopeOwn,
          permissions: r.permissions,
          isSystem: true,
        })),
      )
      .returning();
    const adminRole = createdRoles.find((r) => r.key === 'admin')!;

    const [user] = await tx
      .insert(users)
      .values({ email: input.email, name: input.ownerName, passwordHash, kind: 'STAFF' })
      .returning({ id: users.id, email: users.email, name: users.name });

    await tx.insert(memberships).values({ organizationId: org.id, userId: user.id, roleId: adminRole.id });

    return { organization: org, user, branch, roles: createdRoles };
  });
}
