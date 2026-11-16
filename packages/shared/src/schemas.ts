import { z } from 'zod';
import { isPermission } from './permissions';

const trimmed = (max: number) => z.string().trim().min(1, 'Obligatorio').max(max, `Máximo ${max} caracteres`);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const passwordSchema = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Usá letras y números');

export const emailSchema = z.string().trim().toLowerCase().email('Correo no válido').max(160);

/** Teléfono paraguayo o internacional: solo dígitos y +, entre 7 y 16 caracteres. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-()]/g, ''))
  .refine((v) => /^\+?\d{7,15}$/.test(v), 'Teléfono no válido');

export const signupSchema = z.object({
  organizationName: trimmed(120),
  ownerName: trimmed(120),
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Obligatorio').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const switchOrgSchema = z.object({ organizationId: z.string().uuid() });

export const inviteUserSchema = z.object({
  name: trimmed(120),
  email: emailSchema,
  roleId: z.string().uuid(),
  branchIds: z.array(z.string().uuid()).default([]),
  /** Contraseña inicial temporal: el usuario la cambia al ingresar. Se reemplaza por invitación por correo cuando el canal esté configurado. */
  temporaryPassword: passwordSchema,
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const roleSchema = z.object({
  name: trimmed(60),
  description: optionalText(200),
  scopeOwn: z.boolean().default(false),
  permissions: z.array(z.string().refine(isPermission, 'Permiso desconocido')).min(1, 'Elegí al menos un permiso'),
});
export type RoleInput = z.infer<typeof roleSchema>;

export const clientSchema = z.object({
  firstName: trimmed(80),
  lastName: trimmed(80),
  documentId: optionalText(30),
  phone: phoneSchema,
  whatsapp: phoneSchema.optional().nullable(),
  email: emailSchema.optional().nullable().or(z.literal('').transform(() => null)),
  address: optionalText(200),
  city: optionalText(80),
  notes: optionalText(2000),
});
export type ClientInput = z.infer<typeof clientSchema>;
export const clientUpdateSchema = clientSchema.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ACTIVE'),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/** Mensajes de validación en español para los casos genéricos de zod. */
z.setErrorMap((issue, ctx) => {
  if (issue.code === z.ZodIssueCode.invalid_type) {
    if (issue.received === 'undefined' || issue.received === 'null') return { message: 'Obligatorio' };
    return { message: 'Tipo de dato no válido' };
  }
  if (issue.code === z.ZodIssueCode.invalid_string && issue.validation === 'uuid') return { message: 'Identificador no válido' };
  if (issue.code === z.ZodIssueCode.invalid_enum_value) return { message: `Valor no válido. Opciones: ${issue.options.join(', ')}` };
  if (issue.code === z.ZodIssueCode.invalid_date) return { message: 'Fecha no válida' };
  return { message: ctx.defaultError };
});
