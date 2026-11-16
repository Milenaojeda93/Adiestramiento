/**
 * Datos de demostración para la empresa demo: servicios, mascotas con historial,
 * programas con cuotas, sesiones pasadas registradas y sesiones de esta semana, pagos y egresos.
 * Se ejecuta una sola vez (si la empresa demo todavía no tiene mascotas).
 */
import { randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { DEFAULT_SKILLS } from '@adiestra/shared';
import type { Db } from './index';
import { hashPassword } from './provision';
import {
  assessments,
  charges,
  clients,
  counters,
  expenses,
  homeTasks,
  memberships,
  packageLedger,
  paymentAllocations,
  payments,
  petGuardians,
  pets,
  programs,
  roles,
  services,
  skillRatings,
  skills,
  trainingSessions,
  users,
} from './schema';

const DAY = 86_400_000;
/** Fecha y hora en Asunción (UTC−3) relativa a hoy. */
function at(days: number, hour: number, minute = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
  return new Date(new Date(`${today}T00:00:00-03:00`).getTime() + days * DAY + (hour * 60 + minute) * 60000);
}
const iso = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(d);

export async function seedDemoData(db: Db, organizationId: string, adminUserId: string) {
  const [has] = await db.select({ n: sql<number>`count(*)::int` }).from(pets).where(eq(pets.organizationId, organizationId));
  if (has.n > 0) return false;

  await db.transaction(async (tx) => {
    // Segundo entrenador para ver la agenda con colores.
    const [trainerRole] = await tx.select().from(roles).where(and(eq(roles.organizationId, organizationId), eq(roles.key, 'trainer')));
    const email = 'andrea.demo@adiestra.local';
    let [andrea] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (!andrea) {
      [andrea] = await tx
        .insert(users)
        .values({ email, name: 'Andrea Rojas', passwordHash: await hashPassword(randomBytes(24).toString('hex')), mustChangePassword: true })
        .returning({ id: users.id });
      await tx.insert(memberships).values({ organizationId, userId: andrea.id, roleId: trainerRole.id });
    }
    const T = [adminUserId, andrea.id];

    let skillRows = await tx.select().from(skills).where(eq(skills.organizationId, organizationId));
    if (!skillRows.length) {
      skillRows = await tx.insert(skills).values(DEFAULT_SKILLS.map((name, i) => ({ organizationId, name, sortOrder: i }))).returning();
    }
    const S = (name: string) => skillRows.find((s) => s.name === name)!.id;

    const [basico, conducta, cachorros] = await tx
      .insert(services)
      .values([
        { organizationId, name: 'Adiestramiento básico', category: 'Obediencia', price: 600000, sessionsCount: 8, durationMinutes: 60, validityDays: 90, description: 'Sentado, quieto, llamado y paseo con correa.' },
        { organizationId, name: 'Modificación de conducta', category: 'Conducta', price: 900000, sessionsCount: 10, durationMinutes: 60, validityDays: 120, description: 'Reactividad, miedos y ansiedad.' },
        { organizationId, name: 'Socialización de cachorros', category: 'Cachorros', price: 350000, sessionsCount: 4, durationMinutes: 45, validityDays: 45 },
        { organizationId, name: 'Asesoramiento online', category: 'Online', price: 150000, sessionsCount: 1, durationMinutes: 45, modality: 'ONLINE' },
      ])
      .returning();

    const cl = await tx.select().from(clients).where(eq(clients.organizationId, organizationId)).orderBy(clients.createdAt);
    const byName = (first: string) => cl.find((c) => c.firstName === first) ?? cl[0];

    const petData = [
      { name: 'Luna', breed: 'Pastor alemán', sex: 'FEMALE' as const, birthDate: '2024-07-10', size: 'L' as const, weightKg: '28', owner: 'Marta', alerts: ['Reactiva con perros'], service: conducta, trainer: 0, done: 6, base: [1, 2, 1], now: [4, 4, 3] },
      { name: 'Toby', breed: 'Golden retriever', sex: 'MALE' as const, birthDate: '2023-03-02', size: 'L' as const, weightKg: '31', owner: 'Jorge', alerts: [], service: basico, trainer: 0, done: 5, base: [2, 2, 3], now: [5, 4, 4], vaccineExpired: true },
      { name: 'Kira', breed: 'Border collie', sex: 'FEMALE' as const, birthDate: '2025-01-15', size: 'M' as const, weightKg: '16', owner: 'Sofía', alerts: [], service: basico, trainer: 1, done: 2, base: [2, 1, 2], now: [3, 2, 3] },
      { name: 'Rocky', breed: 'Bulldog francés', sex: 'MALE' as const, birthDate: '2024-11-20', size: 'S' as const, weightKg: '12', owner: 'Ricardo', alerts: ['Problemas respiratorios: pausas cortas'], service: basico, trainer: 1, done: 1, base: [1, 2, 1], now: [2, 2, 2] },
      { name: 'Nala', breed: 'Mestiza', sex: 'FEMALE' as const, birthDate: '2026-06-01', size: 'M' as const, weightKg: '9', owner: 'Patricia', alerts: [], service: cachorros, trainer: 1, done: 3, base: [1, 1, 1], now: [3, 3, 2] },
    ];
    const rated = ['Acudir al llamado', 'Caminar con correa', 'Control de impulsos'];

    let receipt = 0;
    for (const [idx, p] of petData.entries()) {
      const owner = byName(p.owner);
      const trainerId = T[p.trainer];
      const start = at(-7 * (p.done + 1), 0);
      const [pet] = await tx
        .insert(pets)
        .values({
          organizationId,
          name: p.name,
          breed: p.breed,
          sex: p.sex,
          birthDate: p.birthDate,
          size: p.size,
          weightKg: p.weightKg,
          alerts: p.alerts,
          joinedAt: iso(start),
          isDemo: true,
          health: {
            vaccines: [{ name: 'Antirrábica', date: '2025-10-01', expires: p.vaccineExpired ? '2026-10-01' : '2027-10-01' }],
            allergies: idx === 0 ? 'Pollo' : null,
            vetName: 'Veterinaria San Roque',
            vetPhone: '021 600 700',
          },
          behavior: { temperament: idx === 0 ? 'Alerta, sensible' : 'Sociable', energy: 3 + (idx % 2), socialization: idx === 0 ? 2 : 4 },
          createdBy: adminUserId,
        })
        .returning();
      await tx.insert(petGuardians).values({ organizationId, petId: pet.id, clientId: owner.id, role: 'OWNER' });

      const [a] = await tx
        .insert(assessments)
        .values({
          organizationId,
          petId: pet.id,
          trainerId,
          assessedAt: iso(start),
          reason: idx === 0 ? 'Ladra y tira de la correa al ver otros perros' : 'Obediencia básica para el paseo y la casa',
          ownerGoals: 'Paseos tranquilos y que venga cuando se lo llama',
          recommendations: idx === 0 ? 'Trabajo de distancia, contracondicionamiento y paseos en horarios tranquilos' : 'Rutina corta diaria de 10 minutos',
          published: true,
        })
        .returning();
      await tx.insert(skillRatings).values(rated.map((r, i) => ({ organizationId, petId: pet.id, skillId: S(r), value: p.base[i], assessmentId: a.id, ratedAt: at(-7 * (p.done + 1), 12) })));

      const service = p.service;
      const [prog] = await tx
        .insert(programs)
        .values({
          organizationId,
          petId: pet.id,
          clientId: owner.id,
          serviceId: service.id,
          trainerId,
          startDate: iso(start),
          expiresAt: service.validityDays ? iso(new Date(start.getTime() + service.validityDays * DAY)) : null,
          sessionsContracted: service.sessionsCount,
          price: service.price,
          goals: 'Ver evaluación inicial',
          createdBy: adminUserId,
        })
        .returning();
      await tx.insert(packageLedger).values({ organizationId, programId: prog.id, kind: 'PURCHASE', delta: service.sessionsCount, note: `${service.name}: ${service.sessionsCount} sesiones`, createdBy: adminUserId });

      // Sesiones realizadas, una por semana, con evolución gradual.
      for (let k = 0; k < p.done; k++) {
        const startsAt = at(-7 * (p.done - k), 9 + idx, 0);
        const [s] = await tx
          .insert(trainingSessions)
          .values({
            organizationId,
            petId: pet.id,
            programId: prog.id,
            trainerId,
            startsAt,
            endsAt: new Date(startsAt.getTime() + service.durationMinutes * 60000),
            modality: service.modality,
            status: 'DONE',
            commands: ['Mirame', 'Junto', 'Ven'].slice(0, 1 + (k % 3)),
            results: k === p.done - 1 ? 'Muy buena sesión: respondió con distracciones moderadas' : 'Progreso sostenido',
            completedAt: startsAt,
            completedBy: trainerId,
            createdBy: adminUserId,
          })
          .returning();
        await tx.insert(packageLedger).values({ organizationId, programId: prog.id, kind: 'CONSUME', delta: -1, sessionId: s.id, note: 'Sesión realizada', createdBy: trainerId });
        const f = (k + 1) / p.done;
        await tx.insert(skillRatings).values(rated.map((r, i) => ({ organizationId, petId: pet.id, skillId: S(r), value: Math.round(p.base[i] + (p.now[i] - p.base[i]) * f), sessionId: s.id, ratedAt: startsAt })));
        if (k === p.done - 1) {
          await tx.insert(homeTasks).values({ organizationId, petId: pet.id, sessionId: s.id, title: idx === 0 ? 'Giros en U al ver otro perro' : 'Juego de "Mirame" con distracciones', frequency: '2 veces por día, 5 minutos' });
        }
      }

      // Próximas sesiones de esta semana y la siguiente.
      for (const [day, hour, status] of [
        [0, 15 + idx, 'CONFIRMED'],
        [2 + (idx % 3), 9 + idx, 'SCHEDULED'],
        [7, 9 + idx, 'SCHEDULED'],
      ] as const) {
        const h = Math.floor(hour);
        const startsAt = at(day, h);
        if (startsAt.getTime() < Date.now()) continue;
        await tx.insert(trainingSessions).values({
          organizationId,
          petId: pet.id,
          programId: prog.id,
          trainerId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + service.durationMinutes * 60000),
          modality: service.modality,
          status,
          location: idx === 0 ? 'A domicilio · Villa Morra' : null,
          createdBy: adminUserId,
        });
      }

      // Cobro: 2 cuotas; la primera paga, la segunda vencida para dos clientes.
      const half = Math.floor(service.price / 2);
      const [c1, c2] = await tx
        .insert(charges)
        .values([
          { organizationId, clientId: owner.id, programId: prog.id, concept: `${service.name} · cuota 1 de 2`, amount: service.price - half, dueDate: iso(start), createdBy: adminUserId },
          {
            organizationId,
            clientId: owner.id,
            programId: prog.id,
            concept: `${service.name} · cuota 2 de 2`,
            amount: half,
            dueDate: iso(new Date(start.getTime() + 30 * DAY)),
            createdBy: adminUserId,
          },
        ])
        .returning();
      receipt++;
      const [pay] = await tx
        .insert(payments)
        .values({ organizationId, clientId: owner.id, amount: c1.amount, method: idx % 2 ? 'CASH' : 'TRANSFER', paidAt: iso(new Date(start.getTime() + DAY)), receiptNumber: receipt, createdBy: adminUserId })
        .returning();
      await tx.insert(paymentAllocations).values({ organizationId, paymentId: pay.id, chargeId: c1.id, amount: c1.amount });
      if (idx === 2 || idx === 4) {
        receipt++;
        const [pay2] = await tx
          .insert(payments)
          .values({ organizationId, clientId: owner.id, amount: c2.amount, method: 'TRANSFER', paidAt: iso(at(-2, 10)), receiptNumber: receipt, createdBy: adminUserId })
          .returning();
        await tx.insert(paymentAllocations).values({ organizationId, paymentId: pay2.id, chargeId: c2.id, amount: c2.amount });
      }
    }
    await tx
      .insert(counters)
      .values({ organizationId, key: 'receipt', value: receipt })
      .onConflictDoUpdate({ target: [counters.organizationId, counters.key], set: { value: receipt } });

    await tx.insert(expenses).values([
      { organizationId, category: 'Alquiler', amount: 2500000, spentAt: iso(at(-10, 10)), createdBy: adminUserId },
      { organizationId, category: 'Premios y alimento', description: 'Snacks de entrenamiento', amount: 180000, spentAt: iso(at(-4, 10)), createdBy: adminUserId },
      { organizationId, category: 'Combustible', amount: 220000, spentAt: iso(at(-1, 10)), createdBy: adminUserId },
    ]);
  });
  return true;
}
