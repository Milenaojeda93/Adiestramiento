import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { createDb } from '@adiestra/db';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { createApp } from '../src/bootstrap';

const PLATFORM_ADMIN = { email: 'plataforma@test.local', password: 'Plataforma2026' };
const ORIGIN = 'http://localhost:3000';

type Agent = ReturnType<typeof request.agent>;

let app: INestApplication;
let server: ReturnType<INestApplication['getHttpServer']>;

async function signup(name: string, email: string): Promise<{ agent: Agent; orgId: string }> {
  const agent = request.agent(server);
  const res = await agent
    .post('/api/v1/auth/signup')
    .set('Origin', ORIGIN)
    .send({ organizationName: name, ownerName: `Dueño ${name}`, email, password: 'ClaveSegura123' })
    .expect(201);
  return { agent, orgId: res.body.organizationId };
}

async function login(email: string, password: string, expected = 200): Promise<Agent> {
  const agent = request.agent(server);
  await agent.post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email, password }).expect(expected);
  return agent;
}

/** Drizzle envuelve el error de PostgreSQL: se valida el mensaje original. */
async function expectDbError(p: Promise<unknown>, re: RegExp) {
  const err = await p.then(
    () => null,
    (e: Error & { cause?: Error }) => e,
  );
  expect(err).not.toBeNull();
  expect(`${err!.message} ${err!.cause?.message ?? ''}`).toMatch(re);
}

const newClient = (first: string, extra: Record<string, unknown> = {}) => ({
  firstName: first,
  lastName: 'Prueba',
  phone: '+595981000111',
  ...extra,
});

beforeAll(async () => {
  app = await createApp();
  await app.init();
  server = app.getHttpServer();
});

afterAll(async () => {
  await app.close();
});

describe('Aislamiento entre empresas', () => {
  let A: { agent: Agent; orgId: string };
  let B: { agent: Agent; orgId: string };
  let clientA: string;
  let clientB: string;

  beforeAll(async () => {
    A = await signup('Centro A', 'a@test.local');
    B = await signup('Centro B', 'b@test.local');
    clientA = (await A.agent.post('/api/v1/clients').send(newClient('Ana')).expect(201)).body.id;
    clientB = (await B.agent.post('/api/v1/clients').send(newClient('Beto')).expect(201)).body.id;
  });

  it('cada empresa lista solo sus clientes', async () => {
    const a = await A.agent.get('/api/v1/clients').expect(200);
    const b = await B.agent.get('/api/v1/clients').expect(200);
    expect(a.body.items.map((c: { id: string }) => c.id)).toEqual([clientA]);
    expect(b.body.items.map((c: { id: string }) => c.id)).toEqual([clientB]);
    expect(a.body.total).toBe(1);
  });

  it('la búsqueda tampoco cruza empresas', async () => {
    const r = await A.agent.get('/api/v1/clients').query({ search: 'Beto' }).expect(200);
    expect(r.body.items).toHaveLength(0);
  });

  it('no puede leer, editar ni desactivar un cliente ajeno conociendo su id', async () => {
    await A.agent.get(`/api/v1/clients/${clientB}`).expect(404);
    await A.agent.patch(`/api/v1/clients/${clientB}`).send({ firstName: 'Hackeado' }).expect(404);
    await A.agent.post(`/api/v1/clients/${clientB}/deactivate`).expect(404);
    const still = await B.agent.get(`/api/v1/clients/${clientB}`).expect(200);
    expect(still.body.firstName).toBe('Beto');
    expect(still.body.status).toBe('ACTIVE');
  });

  it('ignora un organizationId enviado por el navegador', async () => {
    const r = await A.agent.post('/api/v1/clients').send(newClient('Intruso', { organizationId: B.orgId })).expect(201);
    expect(r.body.organizationId).toBe(A.orgId);
    const b = await B.agent.get('/api/v1/clients').expect(200);
    expect(b.body.items.some((c: { firstName: string }) => c.firstName === 'Intruso')).toBe(false);
  });

  it('no puede cambiarse a una empresa de la que no es miembro', async () => {
    await A.agent.post('/api/v1/auth/switch-organization').send({ organizationId: B.orgId }).expect(403);
  });

  it('usuarios, roles y auditoría son propios de cada empresa', async () => {
    const users = await A.agent.get('/api/v1/users').expect(200);
    expect(users.body.map((u: { email: string }) => u.email)).toEqual(['a@test.local']);
    const rolesA = await A.agent.get('/api/v1/roles').expect(200);
    const rolesB = await B.agent.get('/api/v1/roles').expect(200);
    const idsB = new Set(rolesB.body.map((r: { id: string }) => r.id));
    expect(rolesA.body.some((r: { id: string }) => idsB.has(r.id))).toBe(false);
    const audit = await A.agent.get('/api/v1/audit').expect(200);
    expect(audit.body.length).toBeGreaterThan(0);
    expect(audit.body.every((e: { entityId: string | null }) => e.entityId !== clientB)).toBe(true);
  });

  it('no puede invitar con un rol de otra empresa', async () => {
    const rolesB = await B.agent.get('/api/v1/roles').expect(200);
    const recB = rolesB.body.find((r: { key: string }) => r.key === 'receptionist');
    const r = await A.agent
      .post('/api/v1/users')
      .send({ name: 'X', email: 'x@test.local', roleId: recB.id, temporaryPassword: 'Temporal12345' })
      .expect(400);
    expect(r.body.code).toBe('INVALID_ROLE');
  });

  it('la base de datos bloquea por sí sola (RLS) aunque la app tuviera un error', async () => {
    const { db, pool } = createDb(process.env.DATABASE_URL_APP!, 1);
    try {
      // Sin empresa fijada: no ve nada.
      const none = await db.execute(sql`select count(*)::int as n from clients`);
      expect(none.rows[0].n).toBe(0);
      await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.org_id', ${A.orgId}, true)`);
        const ajenos = await tx.execute(sql`select count(*)::int as n from clients where organization_id = ${B.orgId}`);
        expect(ajenos.rows[0].n).toBe(0);
        const upd = await tx.execute(sql`update clients set first_name = 'X' where id = ${clientB}`);
        expect(upd.rowCount).toBe(0);
      });
      await expectDbError(
        db.transaction(async (tx) => {
          await tx.execute(sql`select set_config('app.org_id', ${A.orgId}, true)`);
          await tx.execute(sql`insert into clients (organization_id, first_name, last_name, phone) values (${B.orgId}, 'x', 'y', '1')`);
        }),
        /row-level security/,
      );
      await expectDbError(db.execute(sql`select password_hash from users`), /permission denied/);
      await expectDbError(db.execute(sql`select * from sessions`), /permission denied/);
      await expectDbError(db.execute(sql`delete from audit_logs`), /permission denied/);
    } finally {
      await pool.end();
    }
  });
});

describe('Roles y permisos', () => {
  let admin: Agent;
  let recepcion: Agent;

  beforeAll(async () => {
    admin = (await signup('Centro Permisos', 'perm@test.local')).agent;
    const roles = await admin.get('/api/v1/roles').expect(200);
    const rec = roles.body.find((r: { key: string }) => r.key === 'receptionist');
    await admin
      .post('/api/v1/users')
      .send({ name: 'Recepción', email: 'recepcion@test.local', roleId: rec.id, temporaryPassword: 'Temporal12345' })
      .expect(201);
    recepcion = await login('recepcion@test.local', 'Temporal12345');
  });

  it('obliga a cambiar la contraseña temporal antes de operar', async () => {
    const r = await recepcion.get('/api/v1/clients').expect(403);
    expect(r.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await recepcion.post('/api/v1/auth/change-password').send({ currentPassword: 'Temporal12345', newPassword: 'NuevaClave12345' }).expect(204);
    await recepcion.get('/api/v1/clients').expect(200);
  });

  it('recepción crea clientes pero no gestiona roles ni configuración', async () => {
    await recepcion.post('/api/v1/clients').send(newClient('Carla')).expect(201);
    const r = await recepcion.get('/api/v1/roles').expect(403);
    expect(r.body.code).toBe('FORBIDDEN');
    await recepcion.patch('/api/v1/organization').send({ name: 'Otro nombre' }).expect(403);
    await recepcion.get('/api/v1/audit').expect(403);
  });

  it('no deja sin administrador a la empresa ni permite autodegradarse', async () => {
    const users = await admin.get('/api/v1/users').expect(200);
    const me = users.body.find((u: { email: string }) => u.email === 'perm@test.local');
    const r = await admin.patch(`/api/v1/users/${me.membershipId}`).send({ active: false }).expect(400);
    expect(r.body.code).toBe('SELF_CHANGE');
  });

  it('bloquea la cuenta tras 5 intentos fallidos', async () => {
    for (let i = 0; i < 5; i++) await login('recepcion@test.local', 'mal-1234567', 401);
    const agent = request.agent(server);
    const r = await agent.post('/api/v1/auth/login').send({ email: 'recepcion@test.local', password: 'NuevaClave12345' }).expect(423);
    expect(r.body.code).toBe('LOCKED');
  });

  it('rechaza peticiones que modifican datos desde otro origen (CSRF)', async () => {
    const r = await admin.post('/api/v1/clients').set('Origin', 'https://sitio-malicioso.com').send(newClient('Z')).expect(403);
    expect(r.body.code).toBe('BAD_ORIGIN');
  });
});

describe('Plataforma SaaS: planes, suspensión y soporte', () => {
  let platform: Agent;
  let C: { agent: Agent; orgId: string };

  beforeAll(async () => {
    platform = await login(PLATFORM_ADMIN.email, PLATFORM_ADMIN.password);
    C = await signup('Centro Planes', 'planes@test.local');
  });

  it('una empresa no accede al panel de plataforma', async () => {
    await C.agent.get('/api/v1/saas/organizations').expect(403);
  });

  it('el panel ve todas las empresas', async () => {
    const r = await platform.get('/api/v1/saas/organizations').expect(200);
    expect(r.body.length).toBeGreaterThanOrEqual(4);
  });

  it('respeta el límite de entrenadores del plan', async () => {
    const plans = await platform.get('/api/v1/saas/plans').expect(200);
    const inicial = plans.body.plans.find((p: { code: string }) => p.code === 'inicial');
    await platform.patch(`/api/v1/saas/organizations/${C.orgId}`).send({ planId: inicial.id }).expect(200);
    const roles = await C.agent.get('/api/v1/roles').expect(200);
    const trainer = roles.body.find((r: { key: string }) => r.key === 'trainer');
    const invite = (n: number) =>
      C.agent.post('/api/v1/users').send({ name: `Ent ${n}`, email: `ent${n}@test.local`, roleId: trainer.id, temporaryPassword: 'Temporal12345' });
    await invite(1).expect(201);
    const r = await invite(2).expect(402);
    expect(r.body.code).toBe('PLAN_LIMIT');
  });

  it('una empresa suspendida puede consultar pero no modificar', async () => {
    await platform.patch(`/api/v1/saas/organizations/${C.orgId}`).send({ status: 'SUSPENDED' }).expect(200);
    await C.agent.get('/api/v1/clients').expect(200);
    const r = await C.agent.post('/api/v1/clients').send(newClient('Dora')).expect(402);
    expect(r.body.code).toBe('READ_ONLY');
    await platform.patch(`/api/v1/saas/organizations/${C.orgId}`).send({ status: 'ACTIVE' }).expect(200);
    await C.agent.post('/api/v1/clients').send(newClient('Dora')).expect(201);
  });

  it('registra pagos de suscripción a mano, sin simular cobros', async () => {
    const r = await platform
      .post(`/api/v1/saas/organizations/${C.orgId}/payments`)
      .send({ paidAt: '2026-11-16', periodEnd: '2026-12-16', note: 'Transferencia Banco X ref 123' })
      .expect(201);
    expect(r.body.status).toBe('ACTIVE');
    expect(r.body.lastPaymentNote).toMatch(/^Registrado a mano/);
  });

  it('el modo soporte exige motivo, es de solo lectura y queda auditado', async () => {
    await platform.post(`/api/v1/saas/organizations/${C.orgId}/support`).send({ reason: 'corto' }).expect(400);
    await platform.post(`/api/v1/saas/organizations/${C.orgId}/support`).send({ reason: 'El cliente reporta un error al listar clientes' }).expect(200);
    const list = await platform.get('/api/v1/clients').expect(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    const w = await platform.post('/api/v1/clients').send(newClient('Soporte')).expect(402);
    expect(w.body.code).toBe('READ_ONLY');
    const audit = await C.agent.get('/api/v1/audit').expect(200);
    expect(audit.body.some((e: { action: string }) => e.action === 'saas.support_start')).toBe(true);
    await platform.post('/api/v1/saas/support/exit').expect(200);
    await platform.get('/api/v1/clients').expect(403);
  });
});
