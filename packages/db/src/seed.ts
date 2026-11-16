/**
 * Seed:
 *   node dist/seed.js            → catálogo de planes y funciones + superadministrador (si hay variables)
 *   node dist/seed.js --demo     → además, una empresa de demostración con clientes marcados como demo
 */
import { eq } from 'drizzle-orm';
import { createDb } from './index';
import { hashPassword, provisionOrganization, seedCatalog } from './provision';
import { seedDemoData } from './demo';
import { clients, memberships, users } from './schema';

const DEMO_CLIENTS = [
  ['Marta', 'Giménez', '3456789', '+595981234567', 'Asunción'],
  ['Jorge', 'Ayala', '4123987', '+595971555123', 'Lambaré'],
  ['Sofía', 'Cabrera', '5012345', '+595982777001', 'San Lorenzo'],
  ['Ricardo', 'Báez', '2987654', '+595961222333', 'Luque'],
  ['Patricia', 'Núñez', '4567012', '+595991444555', 'Asunción'],
];

async function main() {
  const url = process.env.DATABASE_URL_OWNER;
  if (!url) throw new Error('Falta DATABASE_URL_OWNER');
  const { db, pool } = createDb(url, 2);

  await seedCatalog(db);
  console.log('Catálogo de planes y funciones listo.');

  const adminEmail = process.env.PLATFORM_ADMIN_EMAIL?.toLowerCase();
  const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, adminEmail));
    if (!exists) {
      await db.insert(users).values({
        email: adminEmail,
        name: 'Administración de plataforma',
        passwordHash: await hashPassword(adminPassword),
        kind: 'PLATFORM_ADMIN',
      });
      console.log(`Superadministrador creado: ${adminEmail}`);
    }
  }

  if (process.argv.includes('--demo')) {
    const email = 'demo@adiestra.local';
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (exists) {
      const [m] = await db.select({ orgId: memberships.organizationId }).from(memberships).where(eq(memberships.userId, exists.id));
      if (m && (await seedDemoData(db, m.orgId, exists.id))) console.log('Datos de demostración cargados.');
      else console.log('La empresa demo ya existe.');
    } else {
      const password = process.env.DEMO_PASSWORD ?? 'Demo12345678';
      const { organization, user } = await provisionOrganization(db, {
        organizationName: 'Centro Canino Demo',
        ownerName: 'Usuario Demo',
        email,
        password,
        planCode: 'empresarial',
        isDemo: true,
      });
      await db.insert(clients).values(
        DEMO_CLIENTS.map(([firstName, lastName, documentId, phone, city]) => ({
          organizationId: organization.id,
          firstName,
          lastName,
          documentId,
          phone,
          whatsapp: phone,
          city,
          isDemo: true,
          createdBy: user.id,
        })),
      );
      await seedDemoData(db, organization.id, user.id);
      console.log(`Empresa demo creada. Ingresá con ${email}${process.env.DEMO_PASSWORD ? ' y la contraseña de DEMO_PASSWORD' : ' / ' + password}`);
    }
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
