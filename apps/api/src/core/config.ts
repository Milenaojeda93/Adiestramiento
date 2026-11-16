import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  /** Rol dueño: login, alta de empresas, panel SaaS. Ignora RLS. */
  DATABASE_URL_OWNER: z.string().url(),
  /** Rol de la aplicación: toda la operación de las empresas. Sujeto a RLS. */
  DATABASE_URL_APP: z.string().url(),
  /** Orígenes permitidos para operaciones que modifican datos (protección CSRF), separados por coma. */
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  /** Días de gracia tras vencer la prueba o el pago, antes de pasar a solo lectura. */
  GRACE_DAYS: z.coerce.number().int().min(0).max(60).default(5),
  /** Conexiones por instancia. En Vercel (funciones) conviene 1–3: el pooler de Supabase hace el resto. */
  PG_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida:\n${missing}`);
  }
  return parsed.data;
}

export const CONFIG = Symbol('CONFIG');
