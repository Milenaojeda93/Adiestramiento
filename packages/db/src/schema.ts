/**
 * Esquema de datos de Adiestra.
 *
 * Regla general: toda tabla de negocio lleva organization_id y está protegida por
 * Row Level Security (ver drizzle/0001_rls.sql). Las tablas globales (users, sessions,
 * plans, features, subscriptions) solo se leen desde el cliente de sistema.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const created = () => ts('created_at').notNull().defaultNow();
const updated = () =>
  ts('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const orgId = () => uuid('organization_id').notNull();

// ─────────────────────────── Plataforma (global) ───────────────────────────

export const orgStatus = pgEnum('org_status', ['ACTIVE', 'SUSPENDED']);
export const subscriptionStatus = pgEnum('subscription_status', ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED']);
export const userKind = pgEnum('user_kind', ['STAFF', 'OWNER', 'PLATFORM_ADMIN']);
export const recordStatus = pgEnum('record_status', ['ACTIVE', 'INACTIVE']);

export const plans = pgTable('plans', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  /** Precio mensual en la unidad mínima de la moneda (PYG sin decimales). */
  priceMonthly: integer('price_monthly').notNull(),
  currency: text('currency').notNull().default('PYG'),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: created(),
  updatedAt: updated(),
});

/** Funciones activables: módulos opcionales ("boarding.enabled") y límites ("trainers.max"). */
export const features = pgTable('features', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['boolean', 'limit'] }).notNull(),
});

export const planFeatures = pgTable(
  'plan_features',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    featureId: uuid('feature_id')
      .notNull()
      .references(() => features.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(true),
    /** null = sin límite */
    limitValue: integer('limit_value'),
  },
  (t) => [primaryKey({ columns: [t.planId, t.featureId] })],
);

export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  ruc: text('ruc'),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  logoKey: text('logo_key'),
  currency: text('currency').notNull().default('PYG'),
  timezone: text('timezone').notNull().default('America/Asuncion'),
  status: orgStatus('status').notNull().default('ACTIVE'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: created(),
  updatedAt: updated(),
});

export const subscriptions = pgTable('subscriptions', {
  id: id(),
  organizationId: uuid('organization_id')
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id),
  status: subscriptionStatus('status').notNull().default('TRIAL'),
  trialEndsAt: ts('trial_ends_at'),
  currentPeriodEnd: ts('current_period_end'),
  /** Hasta integrar una pasarela, el superadministrador registra los pagos a mano. */
  lastPaymentAt: ts('last_payment_at'),
  lastPaymentNote: text('last_payment_note'),
  createdAt: created(),
  updatedAt: updated(),
});

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  kind: userKind('kind').notNull().default('STAFF'),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  active: boolean('active').notNull().default(true),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: ts('locked_until'),
  lastLoginAt: ts('last_login_at'),
  createdAt: created(),
  updatedAt: updated(),
});

/** Sesión de servidor: el navegador guarda un token opaco; aquí solo su hash SHA-256. */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    /** Empresa activa en esta sesión (un usuario puede pertenecer a varias). */
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
    /** Superadministrador dando soporte dentro de una empresa. */
    impersonating: boolean('impersonating').notNull().default(false),
    ip: text('ip'),
    userAgent: text('user_agent'),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    createdAt: created(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

// ─────────────────────────── Por empresa (protegidas por RLS) ───────────────────────────

export const branches = pgTable(
  'branches',
  {
    id: id(),
    organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    address: text('address'),
    phone: text('phone'),
    isDefault: boolean('is_default').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('branches_org_idx').on(t.organizationId)],
);

export const roles = pgTable(
  'roles',
  {
    id: id(),
    organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    /** Roles base: admin, supervisor, trainer, receptionist. null = rol creado por la empresa. */
    key: text('key'),
    name: text('name').notNull(),
    description: text('description'),
    /** true = solo ve registros asignados a sí mismo (entrenador). */
    scopeOwn: boolean('scope_own').notNull().default(false),
    permissions: text('permissions').array().notNull().default(sql`'{}'::text[]`),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex('roles_org_name_uq').on(t.organizationId, t.name)],
);

export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    /** Sucursales permitidas. Vacío = todas. */
    branchIds: uuid('branch_ids').array().notNull().default(sql`'{}'::uuid[]`),
    active: boolean('active').notNull().default(true),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex('memberships_org_user_uq').on(t.organizationId, t.userId)],
);

export const clients = pgTable(
  'clients',
  {
    id: id(),
    organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    documentId: text('document_id'),
    phone: text('phone').notNull(),
    whatsapp: text('whatsapp'),
    email: text('email'),
    address: text('address'),
    city: text('city'),
    notes: text('notes'),
    status: recordStatus('status').notNull().default('ACTIVE'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdBy: uuid('created_by'),
    createdAt: created(),
    updatedAt: updated(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    uniqueIndex('clients_org_document_uq')
      .on(t.organizationId, t.documentId)
      .where(sql`${t.documentId} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    index('clients_org_name_idx').on(t.organizationId, t.lastName, t.firstName),
    index('clients_org_phone_idx').on(t.organizationId, t.phone),
  ],
);

/** Registro inalterable de operaciones importantes (la app no puede editar ni borrar). */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id'),
    actorName: text('actor_name'),
    action: text('action').notNull(),
    entity: text('entity'),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    createdAt: created(),
  },
  (t) => [index('audit_org_created_idx').on(t.organizationId, t.createdAt)],
);

/** Tablas por empresa: cada una recibe políticas RLS en la migración 0001. */
export const TENANT_TABLES = ['branches', 'roles', 'memberships', 'clients', 'audit_logs'] as const;
