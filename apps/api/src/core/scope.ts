import { Column, getTableName, sql, SQL } from 'drizzle-orm';
import type { RequestContext } from './context';

/**
 * Referencia a una columna siempre calificada con su tabla ("pets"."id").
 * Drizzle omite el nombre de la tabla cuando la consulta tiene una sola tabla, y dentro de una
 * subconsulta un "id" suelto se confunde con la columna de la subconsulta.
 */
export const col = (c: Column) => sql.raw(`"${getTableName(c.table)}"."${c.name}"`);

/**
 * Alcance del rol Entrenador (scopeOwn): solo ve las mascotas que tiene asignadas
 * por un programa o por una sesión en su agenda, y los clientes responsables de esas mascotas.
 * Para los demás roles no agrega condiciones.
 */
export function ownPetsCondition(ctx: RequestContext, petIdColumn: Column): SQL | undefined {
  if (!ctx.membership?.scopeOwn) return undefined;
  const me = ctx.user.id;
  return sql`(exists (select 1 from programs p where p.pet_id = ${col(petIdColumn)} and p.trainer_id = ${me})
           or exists (select 1 from training_sessions s where s.pet_id = ${col(petIdColumn)} and s.trainer_id = ${me}))`;
}

export function ownClientsCondition(ctx: RequestContext, clientIdColumn: Column): SQL | undefined {
  if (!ctx.membership?.scopeOwn) return undefined;
  const me = ctx.user.id;
  return sql`exists (select 1 from pet_guardians g where g.client_id = ${col(clientIdColumn)} and (
              exists (select 1 from programs p where p.pet_id = g.pet_id and p.trainer_id = ${me})
           or exists (select 1 from training_sessions s where s.pet_id = g.pet_id and s.trainer_id = ${me})))`;
}

/** Escapa comodines de LIKE en un término de búsqueda. */
export const likeTerm = (q: string) => `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
