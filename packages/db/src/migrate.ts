import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './index';

async function main() {
  const url = process.env.DATABASE_URL_OWNER;
  if (!url) throw new Error('Falta DATABASE_URL_OWNER');
  const { db, pool } = createDb(url, 1);
  await migrate(db, { migrationsFolder: path.join(__dirname, '..', 'drizzle') });
  await pool.end();
  console.log('Migraciones aplicadas.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
