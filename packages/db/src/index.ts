import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export * from './schema';
export { schema };
export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function createDb(connectionString: string, max = 10): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString, max });
  return { db: drizzle(pool, { schema }), pool };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ejecuta `fn` dentro de una transacción con la empresa fijada en app.org_id.
 * Toda consulta hecha con `tx` queda filtrada por RLS a esa empresa.
 * El valor se fija con set_config(..., true): vive solo durante la transacción,
 * así una conexión reutilizada del pool nunca arrastra la empresa anterior.
 */
export async function withTenant<T>(db: Db, organizationId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(organizationId)) throw new Error('organization_id inválido');
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${organizationId}, true)`);
    return fn(tx);
  });
}
export * from './provision';
export type { Pool } from 'pg';
