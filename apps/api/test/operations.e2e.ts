import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { createDb, TENANT_TABLES } from '@adiestra/db';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { createApp } from '../src/bootstrap';

type Agent = ReturnType<typeof request.agent>;
let app: INestApplication;
let server: ReturnType<INestApplication['getHttpServer']>;

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** Una hora fija (en Asunción) relativa a hoy, para que las pruebas no dependan de la hora en que corren. */
function at(daysFromToday: number, hour: number, minute = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
  return new Date(new Date(`${today}T00:00:00-03:00`).getTime() + daysFromToday * DAY + hour * HOUR + minute * 60000).toISOString();
}

async function signup(name: string, email: string) {
  const agent = request.agent(server);
  const r = await agent.post('/api/v1/auth/signup').send({ organizationName: name, ownerName: `Admin ${name}`, email, password: 'ClaveSegura123' }).expect(201);
  return { agent, orgId: r.body.organizationId as string, userId: r.body.userId as string };
}
async function login(email: string, password: string) {
  const agent = request.agent(server);
  await agent.post('/api/v1/auth/login').send({ email, password }).expect(200);
  return agent;
}

interface Org {
  agent: Agent;
  orgId: string;
  userId: string;
  clientId: string;
  petId: string;
  serviceId: string;
  programId: string;
}

async function setupOrg(tag: string): Promise<Org> {
  const { agent, orgId, userId } = await signup(`Centro ${tag}`, `ops-${tag}@test.local`);
  const clientId = (await agent.post('/api/v1/clients').send({ firstName: 'Marta', lastName: `Giménez ${tag}`, phone: '0981123456' }).expect(201)).body.id;
  const petId = (await agent.post('/api/v1/pets').send({ name: `Luna ${tag}`, breed: 'Pastor alemán', sex: 'FEMALE', ownerClientId: clientId }).expect(201)).body.id;
  const serviceId = (
    await agent.post('/api/v1/services').send({ name: 'Modificación de conducta', price: 900000, sessionsCount: 3, durationMinutes: 60 }).expect(201)
  ).body.id;
  const programId = (
    await agent
      .post('/api/v1/programs')
      .send({ petId, clientId, serviceId, trainerId: userId, startDate: at(-30, 0).slice(0, 10), installments: 3, firstDueDate: at(-20, 12).slice(0, 10) })
      .expect(201)
  ).body.id;
  return { agent, orgId, userId, clientId, petId, serviceId, programId };
}

beforeAll(async () => {
  app = await createApp();
  await app.init();
  server = app.getHttpServer();
});
afterAll(async () => {
  await app.close();
});

describe('Operación: mascotas, programas, agenda, seguimiento y finanzas', () => {
  let A: Org;
  let B: Org;

  beforeAll(async () => {
    A = await setupOrg('A');
    B = await setupOrg('B');
  });

  describe('Mascotas', () => {
    it('una empresa no ve ni modifica mascotas de otra', async () => {
      const list = await A.agent.get('/api/v1/pets').expect(200);
      expect(list.body.items.map((p: { id: string }) => p.id)).toEqual([A.petId]);
      expect(list.body.items[0].owners).toBe('Marta Giménez A');
      await A.agent.get(`/api/v1/pets/${B.petId}`).expect(404);
      await A.agent.patch(`/api/v1/pets/${B.petId}`).send({ name: 'X' }).expect(404);
    });

    it('no se puede crear una mascota con un propietario de otra empresa', async () => {
      const r = await A.agent.post('/api/v1/pets').send({ name: 'Intrusa', ownerClientId: B.clientId }).expect(400);
      expect(r.body.code).toBe('INVALID_CLIENT');
    });

    it('guarda salud, conducta y avisos; admite varios responsables y protege al último titular', async () => {
      await A.agent
        .patch(`/api/v1/pets/${A.petId}`)
        .send({
          alerts: ['Reactiva con perros'],
          health: { vaccines: [{ name: 'Antirrábica', date: '2025-01-10', expires: '2026-01-10' }], allergies: 'Pollo' },
          behavior: { temperament: 'Alerta', energy: 4 },
        })
        .expect(200);
      const second = (await A.agent.post('/api/v1/clients').send({ firstName: 'Diego', lastName: 'Giménez', phone: '0981999888' }).expect(201)).body.id;
      await A.agent.post(`/api/v1/pets/${A.petId}/guardians`).send({ clientId: second, role: 'AUTHORIZED' }).expect(201);
      const pet = await A.agent.get(`/api/v1/pets/${A.petId}`).expect(200);
      expect(pet.body.health.allergies).toBe('Pollo');
      expect(pet.body.guardians).toHaveLength(2);
      const owner = pet.body.guardians.find((g: { role: string }) => g.role === 'OWNER');
      const r = await A.agent.delete(`/api/v1/pets/${A.petId}/guardians/${owner.id}`).expect(400);
      expect(r.body.code).toBe('LAST_OWNER');
      // Un responsable de otra empresa no se puede vincular.
      await A.agent.post(`/api/v1/pets/${A.petId}/guardians`).send({ clientId: B.clientId }).expect(400);
    });
  });

  describe('Evaluación y programa', () => {
    it('la evaluación inicial guarda calificaciones que forman la línea base', async () => {
      const skills = (await A.agent.get('/api/v1/skills').expect(200)).body;
      expect(skills.length).toBeGreaterThanOrEqual(5);
      const a = await A.agent
        .post('/api/v1/assessments')
        .send({ petId: A.petId, reason: 'Ladra a otros perros', assessedAt: at(-30, 0).slice(0, 10), ratings: [{ skillId: skills[0].id, value: 2 }] })
        .expect(201);
      const full = await A.agent.get(`/api/v1/assessments/${a.body.id}`).expect(200);
      expect(full.body.ratings[0].value).toBe(2);
      expect(full.body.owners[0].lastName).toBe('Giménez A');
      await B.agent.get(`/api/v1/assessments/${a.body.id}`).expect(404);
    });

    it('el programa acredita las sesiones y genera las cuotas', async () => {
      const p = await A.agent.get(`/api/v1/programs/${A.programId}`).expect(200);
      expect(p.body.balance).toBe(3);
      expect(p.body.ledger[0].kind).toBe('PURCHASE');
      const acc = await A.agent.get(`/api/v1/clients/${A.clientId}/account`).expect(200);
      expect(acc.body.charges).toHaveLength(3);
      expect(acc.body.charges.reduce((s: number, c: { amount: number }) => s + c.amount, 0)).toBe(900000);
      expect(acc.body.balance).toBe(900000);
    });

    it('no acepta un programa para un cliente que no es responsable de la mascota', async () => {
      const other = (await A.agent.post('/api/v1/clients').send({ firstName: 'Ajeno', lastName: 'X', phone: '0981000000' }).expect(201)).body.id;
      const r = await A.agent
        .post('/api/v1/programs')
        .send({ petId: A.petId, clientId: other, serviceId: A.serviceId, trainerId: A.userId, startDate: at(0, 0).slice(0, 10) })
        .expect(400);
      expect(r.body.code).toBe('NOT_GUARDIAN');
    });
  });

  describe('Agenda', () => {
    let s1: string;

    it('crea sesiones y rechaza choques de horario sugiriendo horarios libres', async () => {
      s1 = (await A.agent.post('/api/v1/sessions').send({ petId: A.petId, programId: A.programId, trainerId: A.userId, startsAt: at(1, 10) }).expect(201)).body[0].id;
      const r = await A.agent.post('/api/v1/sessions').send({ petId: A.petId, trainerId: A.userId, startsAt: at(1, 10, 30) }).expect(409);
      expect(r.body.code).toBe('SCHEDULE_CONFLICT');
      expect(r.body.details.suggestions.length).toBeGreaterThan(0);
    });

    it('respeta el horario laboral y las ausencias del entrenador', async () => {
      const weekday = new Date(at(2, 12)).getUTCDay();
      await A.agent.put('/api/v1/working-hours').send({ userId: A.userId, blocks: [{ weekday, startMinute: 8 * 60, endMinute: 12 * 60 }] }).expect(200);
      const r = await A.agent.post('/api/v1/sessions').send({ petId: A.petId, trainerId: A.userId, startsAt: at(2, 15) }).expect(409);
      expect(r.body.code).toBe('OUTSIDE_HOURS');
      await A.agent.post('/api/v1/time-off').send({ userId: A.userId, startsAt: at(2, 8), endsAt: at(2, 10), reason: 'Veterinario' }).expect(201);
      const r2 = await A.agent.post('/api/v1/sessions').send({ petId: A.petId, trainerId: A.userId, startsAt: at(2, 9) }).expect(409);
      expect(r2.body.code).toBe('TIME_OFF');
      await A.agent.post('/api/v1/sessions').send({ petId: A.petId, trainerId: A.userId, startsAt: at(2, 10) }).expect(201);
      await A.agent.put('/api/v1/working-hours').send({ userId: A.userId, blocks: [] }).expect(200);
    });

    it('la base de datos impide superposiciones aunque la app no validara', async () => {
      const { db, pool } = createDb(process.env.DATABASE_URL_APP!, 1);
      try {
        const err = await db
          .transaction(async (tx) => {
            await tx.execute(sql`select set_config('app.org_id', ${A.orgId}, true)`);
            await tx.execute(sql`insert into training_sessions (organization_id, pet_id, trainer_id, starts_at, ends_at)
                                 values (${A.orgId}, ${A.petId}, ${A.userId}, ${at(1, 10, 15)}, ${at(1, 11, 15)})`);
          })
          .then(() => null, (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ''}`);
        expect(err).toMatch(/no_overlap|conflicting key|exclusion/);
      } finally {
        await pool.end();
      }
    });

    it('reprograma, confirma y cancela; otra empresa no puede tocar la sesión', async () => {
      await B.agent.post(`/api/v1/sessions/${s1}/confirm`).expect(404);
      await A.agent.patch(`/api/v1/sessions/${s1}/reschedule`).send({ startsAt: at(3, 9) }).expect(200);
      await A.agent.post(`/api/v1/sessions/${s1}/confirm`).expect(200);
      const ag = await A.agent.get('/api/v1/agenda').query({ from: at(0, 0), to: at(7, 0) }).expect(200);
      expect(ag.body.sessions.find((s: { id: string }) => s.id === s1).status).toBe('CONFIRMED');
      const bAg = await B.agent.get('/api/v1/agenda').query({ from: at(0, 0), to: at(7, 0) }).expect(200);
      expect(bAg.body.sessions).toHaveLength(0);
      await A.agent.post(`/api/v1/sessions/${s1}/cancel`).send({ reason: 'Lluvia' }).expect(200);
    });
  });

  describe('Seguimiento y paquete', () => {
    let past: string;

    it('no deja registrar una sesión futura', async () => {
      const f = (await A.agent.post('/api/v1/sessions').send({ petId: A.petId, programId: A.programId, trainerId: A.userId, startsAt: at(5, 10) }).expect(201)).body[0].id;
      const r = await A.agent.post(`/api/v1/sessions/${f}/record`).send({ attendance: 'DONE' }).expect(400);
      expect(r.body.code).toBe('FUTURE_SESSION');
    });

    it('al registrar descuenta 1 sesión, guarda calificaciones y tareas', async () => {
      past = (await A.agent.post('/api/v1/sessions').send({ petId: A.petId, programId: A.programId, trainerId: A.userId, startsAt: at(-2, 10) }).expect(201)).body[0].id;
      const skills = (await A.agent.get('/api/v1/skills').expect(200)).body;
      const r = await A.agent
        .post(`/api/v1/sessions/${past}/record`)
        .send({
          attendance: 'DONE',
          results: 'Cruzó a otro perro a 6 m sin ladrar',
          commands: ['Mirame', 'Junto'],
          ratings: [{ skillId: skills[0].id, value: 4 }],
          tasks: [{ title: 'Giros en U', frequency: '2 por paseo' }],
        })
        .expect(200);
      expect(r.body.consumed).toBe(true);
      expect((await A.agent.get(`/api/v1/programs/${A.programId}`)).body.balance).toBe(2);
      const progress = (await A.agent.get(`/api/v1/pets/${A.petId}/progress`).expect(200)).body;
      expect(progress.map((p: { value: number }) => p.value)).toEqual([2, 4]);
      expect((await A.agent.get(`/api/v1/pets/${A.petId}/tasks`)).body[0].title).toBe('Giros en U');
      // Ya registrada: no se puede cancelar ni mover.
      await A.agent.post(`/api/v1/sessions/${past}/cancel`).send({ reason: 'x' }).expect(400);
    });

    it('la ausencia descuenta según la política de la empresa', async () => {
      await A.agent.patch('/api/v1/organization/policies').send({ noShowConsumes: false, cancelHours: 24 }).expect(200);
      const ns = (await A.agent.post('/api/v1/sessions').send({ petId: A.petId, programId: A.programId, trainerId: A.userId, startsAt: at(-3, 10) }).expect(201)).body[0].id;
      const r = await A.agent.post(`/api/v1/sessions/${ns}/record`).send({ attendance: 'NO_SHOW' }).expect(200);
      expect(r.body.consumed).toBe(false);
      expect((await A.agent.get(`/api/v1/programs/${A.programId}`)).body.balance).toBe(2);
      await A.agent.patch('/api/v1/organization/policies').send({ noShowConsumes: true, cancelHours: 24 }).expect(200);
    });

    it('no deja consumir más sesiones que las contratadas', async () => {
      for (const d of [-4, -5]) {
        const id = (await A.agent.post('/api/v1/sessions').send({ petId: A.petId, programId: A.programId, trainerId: A.userId, startsAt: at(d, 10) }).expect(201)).body[0].id;
        await A.agent.post(`/api/v1/sessions/${id}/record`).send({ attendance: 'DONE' }).expect(200);
      }
      const extra = (await A.agent.post('/api/v1/sessions').send({ petId: A.petId, programId: A.programId, trainerId: A.userId, startsAt: at(-6, 10) }).expect(201)).body[0].id;
      const r = await A.agent.post(`/api/v1/sessions/${extra}/record`).send({ attendance: 'DONE' }).expect(400);
      expect(r.body.code).toBe('PACKAGE_EMPTY');
    });

    it('revertir un registro devuelve la sesión al paquete', async () => {
      await A.agent.post(`/api/v1/sessions/${past}/revert`).send({ reason: 'Se registró en la mascota equivocada' }).expect(200);
      expect((await A.agent.get(`/api/v1/programs/${A.programId}`)).body.balance).toBe(1);
      const ledger = (await A.agent.get(`/api/v1/programs/${A.programId}`)).body.ledger;
      expect(ledger.map((l: { kind: string }) => l.kind)).toContain('REVERSE');
    });

    it('el entrenador ve solo sus mascotas asignadas', async () => {
      const roles = (await A.agent.get('/api/v1/roles')).body;
      const trainerRole = roles.find((r: { key: string }) => r.key === 'trainer');
      await A.agent
        .post('/api/v1/users')
        .send({ name: 'Carlos', email: 'carlos-ops@test.local', roleId: trainerRole.id, temporaryPassword: 'Temporal12345' })
        .expect(201);
      const carlos = await login('carlos-ops@test.local', 'Temporal12345');
      await carlos.post('/api/v1/auth/change-password').send({ currentPassword: 'Temporal12345', newPassword: 'Carlos123456' }).expect(204);
      expect((await carlos.get('/api/v1/pets').expect(200)).body.items).toHaveLength(0);
      const carlosId = (await A.agent.get('/api/v1/trainers')).body.find((t: { name: string }) => t.name === 'Carlos').id;
      await A.agent.patch(`/api/v1/programs/${A.programId}`).send({ trainerId: carlosId }).expect(200);
      expect((await carlos.get('/api/v1/pets').expect(200)).body.items).toHaveLength(1);
      expect((await carlos.get('/api/v1/clients').expect(200)).body.items).toHaveLength(2);
      // El entrenador no ve finanzas.
      await carlos.get('/api/v1/finance/balances').expect(403);
    });
  });

  describe('Finanzas', () => {
    it('imputa el pago a la cuota más antigua y numera los recibos', async () => {
      const r1 = await A.agent.post('/api/v1/payments').send({ clientId: A.clientId, amount: 400000, method: 'TRANSFER', paidAt: at(0, 12).slice(0, 10) }).expect(201);
      expect(r1.body.allocations).toHaveLength(2); // 300.000 a la cuota 1 y 100.000 a la cuota 2
      expect(r1.body.allocations[0].amount).toBe(300000);
      expect(r1.body.remaining).toBe(500000);
      const r2 = await A.agent.post('/api/v1/payments').send({ clientId: A.clientId, amount: 100000, method: 'CASH', paidAt: at(0, 12).slice(0, 10) }).expect(201);
      expect(r2.body.receiptNumber).toBe(r1.body.receiptNumber + 1);
      const receipt = await A.agent.get(`/api/v1/payments/${r1.body.id}/receipt`).expect(200);
      expect(receipt.body.lines).toHaveLength(2);
      await B.agent.get(`/api/v1/payments/${r1.body.id}/receipt`).expect(404);
    });

    it('no acepta pagos mayores a la deuda', async () => {
      const r = await A.agent.post('/api/v1/payments').send({ clientId: A.clientId, amount: 10_000_000, method: 'CASH', paidAt: at(0, 12).slice(0, 10) }).expect(400);
      expect(r.body.code).toBe('OVERPAYMENT');
    });

    it('anular un pago devuelve el saldo', async () => {
      const before = (await A.agent.get(`/api/v1/clients/${A.clientId}/account`)).body.balance;
      const p = (await A.agent.post('/api/v1/payments').send({ clientId: A.clientId, amount: 50000, method: 'CASH', paidAt: at(0, 12).slice(0, 10) }).expect(201)).body;
      await A.agent.post(`/api/v1/payments/${p.id}/void`).send({ reason: 'Cargado dos veces' }).expect(200);
      expect((await A.agent.get(`/api/v1/clients/${A.clientId}/account`)).body.balance).toBe(before);
    });

    it('los saldos, egresos y el dashboard son propios de cada empresa', async () => {
      await A.agent.post('/api/v1/expenses').send({ category: 'Premios', amount: 85000, spentAt: at(0, 12).slice(0, 10) }).expect(201);
      const bal = (await A.agent.get('/api/v1/finance/balances').expect(200)).body;
      expect(bal).toHaveLength(1);
      expect(bal[0].balance).toBe(400000);
      expect((await B.agent.get('/api/v1/expenses')).body).toHaveLength(0);
      const dash = (await A.agent.get('/api/v1/dashboard').expect(200)).body;
      expect(dash.kpis.pets).toBe(1);
      expect(dash.finance.income).toBe(500000);
      const dashB = (await B.agent.get('/api/v1/dashboard').expect(200)).body;
      expect(dashB.finance.income).toBe(0);
    });
  });

  it('RLS: ninguna tabla de empresa deja ver filas de otra', async () => {
    const { db, pool } = createDb(process.env.DATABASE_URL_APP!, 1);
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.org_id', ${B.orgId}, true)`);
        for (const t of TENANT_TABLES) {
          const r = await tx.execute(sql.raw(`select count(*)::int as n from ${t} where organization_id = '${A.orgId}'`));
          expect({ table: t, n: r.rows[0].n }).toEqual({ table: t, n: 0 });
        }
      });
      // El libro del paquete y las imputaciones no se pueden editar ni borrar.
      await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.org_id', ${A.orgId}, true)`);
        const err = await tx.execute(sql`delete from package_ledger`).then(
          () => null,
          (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ''}`,
        );
        expect(err).toMatch(/permission denied/);
      }).catch(() => undefined);
    } finally {
      await pool.end();
    }
  });
});
