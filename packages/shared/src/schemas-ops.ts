import { z } from 'zod';
import { phoneSchema } from './schemas';

const txt = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const req = (max: number) => z.string().trim().min(1, 'Obligatorio').max(max, `Máximo ${max} caracteres`);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida (AAAA-MM-DD)');
const optDate = isoDate.optional().nullable().or(z.literal('').transform(() => null));
const money = z.coerce.number().int('Sin decimales').min(0, 'No puede ser negativo').max(2_000_000_000);
const uuid = z.string().uuid();

/** Escala de calificación de habilidades. */
export const RATING_SCALE = [
  { value: 1, label: 'No lo hace' },
  { value: 2, label: 'Lo intenta' },
  { value: 3, label: 'Con ayuda' },
  { value: 4, label: 'Sin ayuda' },
  { value: 5, label: 'Con distracciones' },
] as const;

export const DEFAULT_SKILLS = [
  'Sentarse',
  'Quedarse quieto',
  'Acudir al llamado',
  'Caminar con correa',
  'Control de impulsos',
  'Socialización',
  'Obediencia general',
];

export const MODALITY_LABELS = { CENTER: 'En el centro', HOME: 'A domicilio', ONLINE: 'Online', GROUP: 'Grupal' } as const;
export const PROGRAM_STATUS_LABELS = { PENDING: 'Pendiente', ACTIVE: 'Activo', PAUSED: 'Pausado', FINISHED: 'Finalizado', CANCELLED: 'Cancelado' } as const;
export const SESSION_STATUS_LABELS = { SCHEDULED: 'Programada', CONFIRMED: 'Confirmada', DONE: 'Realizada', CANCELLED: 'Cancelada', NO_SHOW: 'Ausente' } as const;
export const PAYMENT_METHOD_LABELS = { CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta', WALLET: 'Billetera', OTHER: 'Otro' } as const;

// ─────────────── Mascotas ───────────────

export const petHealthSchema = z.object({
  vaccines: z.array(z.object({ name: req(80), date: optDate, expires: optDate })).max(30).default([]),
  deworming: txt(300),
  allergies: txt(300),
  conditions: txt(500),
  medications: txt(500),
  restrictions: txt(500),
  vetName: txt(120),
  vetPhone: txt(30),
  emergencyName: txt(120),
  emergencyPhone: txt(30),
});

export const petBehaviorSchema = z.object({
  temperament: txt(200),
  energy: z.coerce.number().int().min(1).max(5).optional().nullable(),
  socialization: z.coerce.number().int().min(1).max(5).optional().nullable(),
  withPeople: txt(500),
  withAnimals: txt(500),
  fears: txt(500),
  problems: txt(1000),
  previousTraining: txt(500),
  notes: txt(2000),
});

export const petSchema = z.object({
  name: req(60),
  species: z.string().trim().min(1).max(40).default('Perro'),
  breed: txt(80),
  sex: z.enum(['MALE', 'FEMALE']).optional().nullable(),
  birthDate: optDate,
  weightKg: z
    .string()
    .trim()
    .regex(/^\d{1,3}([.,]\d{1,2})?$/, 'Peso no válido')
    .transform((v) => v.replace(',', '.'))
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  size: z.enum(['S', 'M', 'L', 'XL']).optional().nullable(),
  color: txt(60),
  joinedAt: optDate,
  alerts: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  /** Al crear: el propietario titular. */
  ownerClientId: uuid.optional(),
  /** Al crear se pueden cargar salud y conducta en el mismo paso. */
  health: petHealthSchema.optional(),
  behavior: petBehaviorSchema.optional(),
});
export const petUpdateSchema = petSchema.omit({ ownerClientId: true, health: true, behavior: true }).partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  health: petHealthSchema.optional(),
  behavior: petBehaviorSchema.optional(),
});

export const guardianSchema = z.object({
  clientId: uuid,
  role: z.enum(['OWNER', 'AUTHORIZED']).default('AUTHORIZED'),
  canPickUp: z.boolean().default(true),
});

// ─────────────── Evaluación ───────────────

export const assessmentSchema = z.object({
  petId: uuid,
  assessedAt: optDate,
  reason: req(1000),
  ownerGoals: txt(1000),
  obedience: txt(1000),
  socialization: txt(1000),
  homeBehavior: txt(1000),
  publicBehavior: txt(1000),
  strangers: txt(1000),
  otherDogs: txt(1000),
  anxiety: z.coerce.number().int().min(1).max(5).optional().nullable(),
  unwantedBehaviors: txt(2000),
  background: txt(2000),
  observations: txt(3000),
  recommendations: txt(3000),
  published: z.boolean().default(false),
  ratings: z.array(z.object({ skillId: uuid, value: z.coerce.number().int().min(1).max(5) })).max(40).default([]),
});

// ─────────────── Servicios y programas ───────────────

export const serviceSchema = z.object({
  name: req(100),
  description: txt(1000),
  category: txt(60),
  price: money,
  sessionsCount: z.coerce.number().int().min(1, 'Al menos 1 sesión').max(200),
  durationMinutes: z.coerce.number().int().min(15).max(600).default(60),
  modality: z.enum(['CENTER', 'HOME', 'ONLINE', 'GROUP']).default('CENTER'),
  validityDays: z.coerce.number().int().min(1).max(730).optional().nullable(),
  conditions: txt(2000),
  active: z.boolean().default(true),
});

export const programSchema = z.object({
  petId: uuid,
  clientId: uuid,
  serviceId: uuid,
  trainerId: uuid,
  startDate: isoDate,
  endDate: optDate,
  goals: txt(2000),
  /** Si se omiten, se toman del servicio. */
  sessionsContracted: z.coerce.number().int().min(1).max(200).optional(),
  price: money.optional(),
  discount: money.default(0),
  /** Cantidad de cuotas en que se cobra el programa (1 = un solo pago). */
  installments: z.coerce.number().int().min(1).max(24).default(1),
  firstDueDate: optDate,
  notes: txt(2000),
});
export const programUpdateSchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'PAUSED', 'FINISHED', 'CANCELLED']).optional(),
  trainerId: uuid.optional(),
  endDate: optDate,
  goals: txt(2000),
  notes: txt(2000),
});
export const packageAdjustSchema = z.object({
  delta: z.coerce.number().int().min(-50).max(50).refine((v) => v !== 0, 'No puede ser 0'),
  note: req(300),
});

// ─────────────── Agenda ───────────────

export const sessionCreateSchema = z
  .object({
    petId: uuid,
    programId: uuid.optional().nullable(),
    trainerId: uuid,
    startsAt: z.coerce.date(),
    durationMinutes: z.coerce.number().int().min(15).max(600).default(60),
    modality: z.enum(['CENTER', 'HOME', 'ONLINE', 'GROUP']).default('CENTER'),
    location: txt(300),
    notes: txt(1000),
    /** Repetir semanalmente N veces (1 = solo esta). */
    repeatWeeks: z.coerce.number().int().min(1).max(26).default(1),
  });
export const sessionRescheduleSchema = z.object({
  startsAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(15).max(600).optional(),
  trainerId: uuid.optional(),
  location: txt(300),
  notes: txt(1000),
});
export const sessionCancelSchema = z.object({ reason: req(300) });

export const sessionRecordSchema = z.object({
  attendance: z.enum(['DONE', 'NO_SHOW']).default('DONE'),
  objectives: txt(2000),
  exercises: txt(2000),
  commands: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  results: txt(3000),
  difficulties: txt(2000),
  behavior: txt(2000),
  responseLevel: z.coerce.number().int().min(1).max(5).optional().nullable(),
  internalNotes: txt(2000),
  nextGoals: txt(2000),
  ratings: z.array(z.object({ skillId: uuid, value: z.coerce.number().int().min(1).max(5) })).max(40).default([]),
  tasks: z.array(z.object({ title: req(200), detail: txt(500), frequency: txt(120) })).max(10).default([]),
});

export const workingHoursSchema = z.object({
  userId: uuid,
  blocks: z
    .array(
      z
        .object({ weekday: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440) })
        .refine((b) => b.endMinute > b.startMinute, 'La hora de fin debe ser posterior al inicio'),
    )
    .max(28),
});
export const timeOffSchema = z
  .object({ userId: uuid, startsAt: z.coerce.date(), endsAt: z.coerce.date(), reason: txt(200) })
  .refine((v) => v.endsAt > v.startsAt, 'La fecha de fin debe ser posterior al inicio');

export const policiesSchema = z.object({
  noShowConsumes: z.boolean(),
  cancelHours: z.coerce.number().int().min(0).max(168),
});

// ─────────────── Finanzas ───────────────

export const chargeSchema = z.object({
  clientId: uuid,
  programId: uuid.optional().nullable(),
  concept: req(200),
  amount: money.refine((v) => v > 0, 'Debe ser mayor a 0'),
  discount: money.default(0),
  dueDate: isoDate,
});

export const paymentSchema = z.object({
  clientId: uuid,
  amount: money.refine((v) => v > 0, 'Debe ser mayor a 0'),
  method: z.enum(['CASH', 'TRANSFER', 'CARD', 'WALLET', 'OTHER']),
  paidAt: isoDate,
  reference: txt(120),
  notes: txt(500),
  /** Imputación manual. Si se omite, se aplica a la deuda más antigua. */
  allocations: z.array(z.object({ chargeId: uuid, amount: money.refine((v) => v > 0) })).optional(),
});

export const expenseSchema = z.object({
  category: req(60),
  description: txt(300),
  amount: money.refine((v) => v > 0, 'Debe ser mayor a 0'),
  spentAt: isoDate,
});

export const rangeQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  trainerId: uuid.optional(),
});
