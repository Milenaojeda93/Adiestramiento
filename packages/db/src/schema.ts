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
  date,
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
  /** Política: ¿una ausencia sin aviso descuenta una sesión del paquete? */
  noShowConsumes: boolean('no_show_consumes').notNull().default(true),
  /** Política: horas mínimas de anticipación para cancelar o reprogramar sin cargo. */
  cancelHours: integer('cancel_hours').notNull().default(24),
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

// ─────────────────────────── Mascotas ───────────────────────────

export const petSex = pgEnum('pet_sex', ['MALE', 'FEMALE']);
export const petSize = pgEnum('pet_size', ['S', 'M', 'L', 'XL']);
export const guardianRole = pgEnum('guardian_role', ['OWNER', 'AUTHORIZED']);

export interface PetHealth {
  vaccines?: { name: string; date?: string | null; expires?: string | null }[];
  deworming?: string | null;
  allergies?: string | null;
  conditions?: string | null;
  medications?: string | null;
  restrictions?: string | null;
  vetName?: string | null;
  vetPhone?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
}

export interface PetBehavior {
  temperament?: string | null;
  energy?: number | null;
  socialization?: number | null;
  withPeople?: string | null;
  withAnimals?: string | null;
  fears?: string | null;
  problems?: string | null;
  previousTraining?: string | null;
  notes?: string | null;
}

export const pets = pgTable(
  'pets',
  {
    id: id(),
    organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    species: text('species').notNull().default('Perro'),
    breed: text('breed'),
    sex: petSex('sex'),
    birthDate: date('birth_date'),
    weightKg: text('weight_kg'),
    size: petSize('size'),
    color: text('color'),
    joinedAt: date('joined_at').notNull().defaultNow(),
    photoKey: text('photo_key'),
    /** Avisos de seguridad visibles en agenda y fichas (ej. "Reactivo con perros", "Usa bozal"). */
    alerts: text('alerts').array().notNull().default(sql`'{}'::text[]`),
    health: jsonb('health').$type<PetHealth>().notNull().default({}),
    behavior: jsonb('behavior').$type<PetBehavior>().notNull().default({}),
    status: recordStatus('status').notNull().default('ACTIVE'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdBy: uuid('created_by'),
    createdAt: created(),
    updatedAt: updated(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [index('pets_org_name_idx').on(t.organizationId, t.name)],
);

/** Responsables de una mascota: un titular y los autorizados. Una mascota puede tener varios; un cliente, varias mascotas. */
export const petGuardians = pgTable(
  'pet_guardians',
  {
    id: id(),
    organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    role: guardianRole('role').notNull().default('OWNER'),
    canPickUp: boolean('can_pick_up').notNull().default(true),
    createdAt: created(),
  },
  (t) => [uniqueIndex('pet_guardians_uq').on(t.petId, t.clientId), index('pet_guardians_client_idx').on(t.clientId)],
);

// ─────────────────────────── Evaluación y habilidades ───────────────────────────

/** Habilidades que se califican en la escala de la empresa (ej. Sentarse, Acudir al llamado). */
export const skills = pgTable(
  'skills',
  {
    id: id(),
    organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: created(),
  },
  (t) => [uniqueIndex('skills_org_name_uq').on(t.organizationId, t.name)],
);

export const assessments = pgTable(
  'assessments',
  {
    id: id(),
    organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    trainerId: uuid('trainer_id').notNull(),
    assessedAt: date('assessed_at').notNull().defaultNow(),
    reason: text('reason').notNull(),
    ownerGoals: text('owner_goals'),
    obedience: text('obedience'),
    socialization: text('socialization'),
    homeBehavior: text('home_behavior'),
    publicBehavior: text('public_behavior'),
    strangers: text('strangers'),
    otherDogs: text('other_dogs'),
    anxiety: integer('anxiety'),
    unwantedBehaviors: text('unwanted_behaviors'),
    background: text('background'),
    observations: text('observations'),
    recommendations: text('recommendations'),
    /** Visible para el propietario en el portal. */
    published: boolean('published').notNull().default(false),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('assessments_pet_idx').on(t.petId)],
);

/** Calificaciones de habilidades: salen de la evaluación inicial o de una sesión. */
export const skillRatings = pgTable(
  'skill_ratings',
  {
    id: id(),
    organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    value: integer('value').notNull(),
    assessmentId: uuid('assessment_id').references(() => assessments.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id'),
    ratedAt: ts('rated_at').notNull().defaultNow(),
  },
  (t) => [index('skill_ratings_pet_idx').on(t.petId, t.skillId, t.ratedAt)],
);

// ─────────────────────────── Servicios y programas ───────────────────────────

export const modality = pgEnum('modality', ['CENTER', 'HOME', 'ONLINE', 'GROUP']);
export const programStatus = pgEnum('program_status', ['PENDING', 'ACTIVE', 'PAUSED', 'FINISHED', 'CANCELLED']);

export const services = pgTable('services', {
  id: id(),
  organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'),
  /** En la unidad mínima de la moneda (PYG sin decimales). */
  price: integer('price').notNull(),
  sessionsCount: integer('sessions_count').notNull().default(1),
  durationMinutes: integer('duration_minutes').notNull().default(60),
  modality: modality('modality').notNull().default('CENTER'),
  /** Días de vigencia del paquete desde el inicio. null = sin vencimiento. */
  validityDays: integer('validity_days'),
  conditions: text('conditions'),
  active: boolean('active').notNull().default(true),
  createdAt: created(),
  updatedAt: updated(),
});

export const programs = pgTable(
  'programs',
  {
    id: id(),
    organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id),
    trainerId: uuid('trainer_id').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    /** Vencimiento del paquete de sesiones. */
    expiresAt: date('expires_at'),
    goals: text('goals'),
    sessionsContracted: integer('sessions_contracted').notNull(),
    price: integer('price').notNull(),
    status: programStatus('status').notNull().default('ACTIVE'),
    notes: text('notes'),
    createdBy: uuid('created_by'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('programs_pet_idx').on(t.petId), index('programs_trainer_idx').on(t.organizationId, t.trainerId, t.status)],
);

/**
 * Libro de movimientos del paquete de sesiones: el saldo nunca se guarda, se suma.
 * +N al contratar, −1 al realizar una sesión (o ausencia si la política lo indica),
 * +1 al revertir, ± ajustes manuales con motivo.
 */
export const packageMovementKind = pgEnum('package_movement_kind', ['PURCHASE', 'CONSUME', 'REVERSE', 'ADJUST', 'EXPIRE']);
export const packageLedger = pgTable(
  'package_ledger',
  {
    id: id(),
    organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    kind: packageMovementKind('kind').notNull(),
    delta: integer('delta').notNull(),
    sessionId: uuid('session_id'),
    note: text('note'),
    createdBy: uuid('created_by'),
    createdAt: created(),
  },
  (t) => [index('package_ledger_program_idx').on(t.programId)],
);

// ─────────────────────────── Agenda y seguimiento ───────────────────────────

export const sessionStatus = pgEnum('session_status', ['SCHEDULED', 'CONFIRMED', 'DONE', 'CANCELLED', 'NO_SHOW']);

/** Horario laboral semanal de cada entrenador. weekday: 0 = domingo … 6 = sábado; minutos desde las 00:00. */
export const workingHours = pgTable('working_hours', {
  id: id(),
  organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  weekday: integer('weekday').notNull(),
  startMinute: integer('start_minute').notNull(),
  endMinute: integer('end_minute').notNull(),
});

/** Días no disponibles, vacaciones o descansos puntuales. */
export const timeOff = pgTable('time_off', {
  id: id(),
  organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at').notNull(),
  reason: text('reason'),
});

/** Sesión: nace programada en la agenda y, al realizarse, guarda el registro del entrenamiento. */
export const trainingSessions = pgTable(
  'training_sessions',
  {
    id: id(),
    organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id),
    programId: uuid('program_id').references(() => programs.id),
    trainerId: uuid('trainer_id').notNull(),
    branchId: uuid('branch_id'),
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at').notNull(),
    modality: modality('modality').notNull().default('CENTER'),
    location: text('location'),
    status: sessionStatus('status').notNull().default('SCHEDULED'),
    notes: text('notes'),
    cancelReason: text('cancel_reason'),
    // Registro del entrenamiento
    objectives: text('objectives'),
    exercises: text('exercises'),
    commands: text('commands').array().notNull().default(sql`'{}'::text[]`),
    results: text('results'),
    difficulties: text('difficulties'),
    behavior: text('behavior'),
    responseLevel: integer('response_level'),
    internalNotes: text('internal_notes'),
    nextGoals: text('next_goals'),
    completedAt: ts('completed_at'),
    completedBy: uuid('completed_by'),
    createdBy: uuid('created_by'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index('sessions_org_start_idx').on(t.organizationId, t.startsAt),
    index('sessions_trainer_idx').on(t.trainerId, t.startsAt),
    index('sessions_pet_idx').on(t.petId, t.startsAt),
  ],
);

export const homeTasks = pgTable(
  'home_tasks',
  {
    id: id(),
    organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => trainingSessions.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    detail: text('detail'),
    frequency: text('frequency'),
    done: boolean('done').notNull().default(false),
    createdAt: created(),
  },
  (t) => [index('home_tasks_pet_idx').on(t.petId)],
);

// ─────────────────────────── Finanzas ───────────────────────────

export const paymentMethod = pgEnum('payment_method', ['CASH', 'TRANSFER', 'CARD', 'WALLET', 'OTHER']);

/** Cargo a cobrar (una venta o cada cuota). El saldo es monto − descuento − pagos imputados. */
export const charges = pgTable(
  'charges',
  {
    id: id(),
    organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    programId: uuid('program_id').references(() => programs.id),
    concept: text('concept').notNull(),
    amount: integer('amount').notNull(),
    discount: integer('discount').notNull().default(0),
    dueDate: date('due_date').notNull(),
    cancelled: boolean('cancelled').notNull().default(false),
    createdBy: uuid('created_by'),
    createdAt: created(),
  },
  (t) => [index('charges_client_idx').on(t.clientId), index('charges_org_due_idx').on(t.organizationId, t.dueDate)],
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    amount: integer('amount').notNull(),
    method: paymentMethod('method').notNull(),
    paidAt: date('paid_at').notNull(),
    reference: text('reference'),
    /** Numeración correlativa de recibos por empresa. */
    receiptNumber: integer('receipt_number').notNull(),
    notes: text('notes'),
    voided: boolean('voided').notNull().default(false),
    createdBy: uuid('created_by'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('payments_receipt_uq').on(t.organizationId, t.receiptNumber), index('payments_org_date_idx').on(t.organizationId, t.paidAt)],
);

export const paymentAllocations = pgTable(
  'payment_allocations',
  {
    id: id(),
    organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    chargeId: uuid('charge_id')
      .notNull()
      .references(() => charges.id),
    amount: integer('amount').notNull(),
  },
  (t) => [index('allocations_charge_idx').on(t.chargeId)],
);

export const expenses = pgTable('expenses', {
  id: id(),
  organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  description: text('description'),
  amount: integer('amount').notNull(),
  spentAt: date('spent_at').notNull(),
  createdBy: uuid('created_by'),
  createdAt: created(),
});

/** Contadores correlativos por empresa (ej. número de recibo). */
export const counters = pgTable(
  'counters',
  {
    organizationId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: integer('value').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.key] })],
);

/** Tablas por empresa: cada una tiene políticas RLS (migraciones 0001 y 0003). */
export const TENANT_TABLES = [
  'branches',
  'roles',
  'memberships',
  'clients',
  'audit_logs',
  'pets',
  'pet_guardians',
  'skills',
  'assessments',
  'skill_ratings',
  'services',
  'programs',
  'package_ledger',
  'working_hours',
  'time_off',
  'training_sessions',
  'home_tasks',
  'charges',
  'payments',
  'payment_allocations',
  'expenses',
  'counters',
] as const;
