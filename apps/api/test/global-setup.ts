import path from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, hashPassword, seedCatalog, users } from '@adiestra/db';
import './env';

export const PLATFORM_ADMIN = { email: 'plataforma@test.local', password: 'Plataforma2026' };

/** Base de pruebas limpia en cada corrida: esquema vacío, migraciones, catálogo y un superadministrador. */
export default async function globalSetup() {
  const { db, pool } = createDb(process.env.DATABASE_URL_OWNER!, 1);
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await migrate(db, { migrationsFolder: path.join(__dirname, '..', '..', '..', 'packages', 'db', 'drizzle') });
  await seedCatalog(db);
  await db.insert(users).values({
    email: PLATFORM_ADMIN.email,
    name: 'Plataforma',
    passwordHash: await hashPassword(PLATFORM_ADMIN.password),
    kind: 'PLATFORM_ADMIN',
  });
  await pool.end();
}
