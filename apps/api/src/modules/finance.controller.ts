import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { charges, clients, counters, expenses, organizations, paymentAllocations, payments, programs, services, Tx, users } from '@adiestra/db';
import { chargeSchema, expenseSchema, paymentSchema } from '@adiestra/shared';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, RequestContext, RequirePermissions } from '../core/context';
import { AppError, notFound } from '../core/errors';
import { col, likeTerm } from '../core/scope';
import { TenantService } from '../core/tenant.service';
import { parse } from '../core/zod';

/** Pagado de un cargo: imputaciones de pagos no anulados. */
const chargePaid = sql<number>`coalesce((select sum(a.amount)::int from payment_allocations a join payments p on p.id = a.payment_id
                                          where a.charge_id = ${col(charges.id)} and not p.voided), 0)`;
const today = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

const monthQuery = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

@Controller()
export class FinanceController {
  constructor(private readonly tenant: TenantService) {}

  /** Saldos por cliente: lo cobrado, lo pendiente y lo vencido. */
  @Get('finance/balances')
  @RequirePermissions('finance:read')
  balances(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    const q = parse(z.object({ search: z.string().trim().max(100).optional(), filter: z.enum(['DEBT', 'OVERDUE', 'ALL']).default('DEBT') }), query);
    const t = today(ctx.org!.timezone);
    return this.tenant.run(ctx, async (tx) => {
      const rows = await tx.execute<{
        client_id: string;
        name: string;
        phone: string;
        charged: number;
        paid: number;
        balance: number;
        overdue: number;
        next_due: string | null;
        oldest_overdue: string | null;
      }>(sql`
        with c as (
          select ch.client_id, ch.due_date, ch.amount - ch.discount as net,
                 coalesce((select sum(a.amount) from payment_allocations a join payments p on p.id = a.payment_id
                           where a.charge_id = ch.id and not p.voided), 0) as paid
          from charges ch where not ch.cancelled
        )
        select cl.id as client_id, cl.first_name || ' ' || cl.last_name as name, coalesce(cl.whatsapp, cl.phone) as phone,
               sum(c.net)::int as charged, sum(c.paid)::int as paid, sum(c.net - c.paid)::int as balance,
               sum(case when c.due_date < ${t} then c.net - c.paid else 0 end)::int as overdue,
               min(case when c.net - c.paid > 0 then c.due_date end)::text as next_due,
               min(case when c.net - c.paid > 0 and c.due_date < ${t} then c.due_date end)::text as oldest_overdue
        from c join clients cl on cl.id = c.client_id
        where ${q.search ? sql`(cl.first_name || ' ' || cl.last_name) ilike ${likeTerm(q.search)}` : sql`true`}
        group by cl.id
        having ${q.filter === 'DEBT' ? sql`sum(c.net - c.paid) > 0` : q.filter === 'OVERDUE' ? sql`sum(case when c.due_date < ${t} then c.net - c.paid else 0 end) > 0` : sql`true`}
        order by sum(case when c.due_date < ${t} then c.net - c.paid else 0 end) desc, min(c.due_date)
        limit 300`);
      return rows.rows;
    });
  }

  /** Cuenta corriente de un cliente: cargos con lo pagado y pagos con su recibo. */
  @Get('clients/:id/account')
  @RequirePermissions('finance:read')
  account(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenant.run(ctx, async (tx) => {
      const [client] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, id));
      if (!client) throw notFound('Cliente');
      const chargeRows = await tx
        .select({
          id: charges.id,
          concept: charges.concept,
          amount: charges.amount,
          discount: charges.discount,
          dueDate: charges.dueDate,
          cancelled: charges.cancelled,
          programId: charges.programId,
          paid: chargePaid,
        })
        .from(charges)
        .where(eq(charges.clientId, id))
        .orderBy(asc(charges.dueDate));
      const paymentRows = await tx
        .select()
        .from(payments)
        .where(eq(payments.clientId, id))
        .orderBy(desc(payments.paidAt), desc(payments.receiptNumber));
      const items = chargeRows.map((c) => ({ ...c, balance: c.cancelled ? 0 : c.amount - c.discount - c.paid }));
      return {
        charges: items,
        payments: paymentRows,
        balance: items.reduce((s, c) => s + c.balance, 0),
        overdue: items.filter((c) => c.dueDate < today(ctx.org!.timezone)).reduce((s, c) => s + c.balance, 0),
      };
    });
  }

  @Post('charges')
  @RequirePermissions('finance:create')
  createCharge(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const input = parse(chargeSchema, body);
    if (input.discount > input.amount) throw new AppError(400, 'VALIDATION', 'El descuento supera el monto', [{ field: 'discount', message: 'Supera el monto' }]);
    return this.tenant.run(ctx, async (tx) => {
      const [c] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, input.clientId));
      if (!c) throw new AppError(400, 'INVALID_CLIENT', 'El cliente no existe');
      const [row] = await tx.insert(charges).values({ ...input, organizationId: ctx.org!.id, createdBy: ctx.user.id }).returning();
      await this.tenant.audit(tx, ctx, { action: 'charge.create', entity: 'charge', entityId: row.id, after: row });
      return row;
    });
  }

  @Post('charges/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('finance:delete')
  cancelCharge(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenant.run(ctx, async (tx) => {
      const [c] = await tx.select({ id: charges.id, paid: chargePaid }).from(charges).where(eq(charges.id, id));
      if (!c) throw notFound('Cargo');
      if (c.paid > 0) throw new AppError(400, 'HAS_PAYMENTS', 'El cargo tiene pagos: anulá primero el pago');
      const [row] = await tx.update(charges).set({ cancelled: true }).where(eq(charges.id, id)).returning();
      await this.tenant.audit(tx, ctx, { action: 'charge.cancel', entity: 'charge', entityId: id });
      return row;
    });
  }

  /** Número correlativo por empresa, seguro ante dos pagos simultáneos. */
  private async nextNumber(tx: Tx, orgId: string, key: string) {
    const [row] = await tx
      .insert(counters)
      .values({ organizationId: orgId, key, value: 1 })
      .onConflictDoUpdate({ target: [counters.organizationId, counters.key], set: { value: sql`${counters.value} + 1` } })
      .returning({ value: counters.value });
    return row.value;
  }

  /**
   * Registrar un pago. Si no se indica a qué cargos aplica, se imputa a la deuda más antigua.
   * No admite pagar más que lo adeudado; el pago parcial deja el resto pendiente.
   */
  @Post('payments')
  @RequirePermissions('finance:create')
  pay(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const input = parse(paymentSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const open = (
        await tx
          .select({ id: charges.id, concept: charges.concept, due: charges.dueDate, net: sql<number>`${charges.amount} - ${charges.discount}`, paid: chargePaid })
          .from(charges)
          .where(and(eq(charges.clientId, input.clientId), eq(charges.cancelled, false)))
          .orderBy(asc(charges.dueDate), asc(charges.createdAt))
          .for('update')
      )
        .map((c) => ({ ...c, pending: c.net - c.paid }))
        .filter((c) => c.pending > 0);
      const debt = open.reduce((s, c) => s + c.pending, 0);
      if (debt === 0) throw new AppError(400, 'NO_DEBT', 'El cliente no tiene saldo pendiente');
      if (input.amount > debt) throw new AppError(400, 'OVERPAYMENT', `El pago supera la deuda (${debt.toLocaleString('es-PY')})`);

      let allocations: { chargeId: string; amount: number }[];
      if (input.allocations?.length) {
        const byId = new Map(open.map((c) => [c.id, c]));
        for (const a of input.allocations) {
          const c = byId.get(a.chargeId);
          if (!c) throw new AppError(400, 'INVALID_CHARGE', 'Cargo no válido para este cliente');
          if (a.amount > c.pending) throw new AppError(400, 'OVER_ALLOCATION', `A "${c.concept}" le quedan ${c.pending.toLocaleString('es-PY')}`);
        }
        if (input.allocations.reduce((s, a) => s + a.amount, 0) !== input.amount) throw new AppError(400, 'ALLOCATION_MISMATCH', 'La imputación no suma el monto del pago');
        allocations = input.allocations;
      } else {
        let left = input.amount;
        allocations = [];
        for (const c of open) {
          if (left <= 0) break;
          const take = Math.min(left, c.pending);
          allocations.push({ chargeId: c.id, amount: take });
          left -= take;
        }
      }

      const receiptNumber = await this.nextNumber(tx, ctx.org!.id, 'receipt');
      const [payment] = await tx
        .insert(payments)
        .values({
          organizationId: ctx.org!.id,
          clientId: input.clientId,
          amount: input.amount,
          method: input.method,
          paidAt: input.paidAt,
          reference: input.reference,
          notes: input.notes,
          receiptNumber,
          createdBy: ctx.user.id,
        })
        .returning();
      await tx.insert(paymentAllocations).values(allocations.map((a) => ({ ...a, organizationId: ctx.org!.id, paymentId: payment.id })));
      await this.tenant.audit(tx, ctx, { action: 'payment.create', entity: 'payment', entityId: payment.id, after: { ...payment, allocations } });
      return { ...payment, allocations, remaining: debt - input.amount };
    });
  }

  @Post('payments/:id/void')
  @HttpCode(200)
  @RequirePermissions('finance:delete')
  voidPayment(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(300) }), body);
    return this.tenant.run(ctx, async (tx) => {
      const [p] = await tx.select().from(payments).where(eq(payments.id, id));
      if (!p) throw notFound('Pago');
      if (p.voided) throw new AppError(400, 'ALREADY_VOIDED', 'El pago ya está anulado');
      const [row] = await tx
        .update(payments)
        .set({ voided: true, notes: `${p.notes ? p.notes + ' · ' : ''}Anulado: ${reason}` })
        .where(eq(payments.id, id))
        .returning();
      await this.tenant.audit(tx, ctx, { action: 'payment.void', entity: 'payment', entityId: id, before: p, after: { reason } });
      return row;
    });
  }

  @Get('payments')
  @RequirePermissions('finance:read')
  listPayments(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    const q = parse(monthQuery, query);
    return this.tenant.run(ctx, (tx) =>
      tx
        .select({
          id: payments.id,
          receiptNumber: payments.receiptNumber,
          amount: payments.amount,
          method: payments.method,
          paidAt: payments.paidAt,
          reference: payments.reference,
          voided: payments.voided,
          client: { id: clients.id, firstName: clients.firstName, lastName: clients.lastName },
        })
        .from(payments)
        .innerJoin(clients, eq(clients.id, payments.clientId))
        .where(and(q.from ? gte(payments.paidAt, q.from) : undefined, q.to ? lte(payments.paidAt, q.to) : undefined))
        .orderBy(desc(payments.paidAt), desc(payments.receiptNumber))
        .limit(500),
    );
  }

  /** Datos del recibo imprimible. */
  @Get('payments/:id/receipt')
  @RequirePermissions('finance:read')
  receipt(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenant.run(ctx, async (tx) => {
      const [p] = await tx
        .select({ payment: payments, client: clients, cashier: users.name })
        .from(payments)
        .innerJoin(clients, eq(clients.id, payments.clientId))
        .leftJoin(users, eq(users.id, payments.createdBy))
        .where(eq(payments.id, id));
      if (!p) throw notFound('Pago');
      const [org] = await tx
        .select({ name: organizations.name, legalName: organizations.legalName, ruc: organizations.ruc, phone: organizations.phone, address: organizations.address, email: organizations.email })
        .from(organizations);
      const lines = await tx
        .select({ concept: charges.concept, amount: paymentAllocations.amount, dueDate: charges.dueDate })
        .from(paymentAllocations)
        .innerJoin(charges, eq(charges.id, paymentAllocations.chargeId))
        .where(eq(paymentAllocations.paymentId, id));
      return { ...p.payment, cashier: p.cashier, client: p.client, organization: org, lines };
    });
  }

  // ─────────────── Egresos ───────────────

  @Get('expenses')
  @RequirePermissions('finance:read')
  listExpenses(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    const q = parse(monthQuery, query);
    return this.tenant.run(ctx, (tx) =>
      tx
        .select()
        .from(expenses)
        .where(and(q.from ? gte(expenses.spentAt, q.from) : undefined, q.to ? lte(expenses.spentAt, q.to) : undefined))
        .orderBy(desc(expenses.spentAt))
        .limit(500),
    );
  }

  @Post('expenses')
  @RequirePermissions('finance:create')
  createExpense(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const input = parse(expenseSchema, body);
    return this.tenant.run(ctx, async (tx) => {
      const [row] = await tx.insert(expenses).values({ ...input, organizationId: ctx.org!.id, createdBy: ctx.user.id }).returning();
      await this.tenant.audit(tx, ctx, { action: 'expense.create', entity: 'expense', entityId: row.id, after: row });
      return row;
    });
  }

  @Get('finance/summary')
  @RequirePermissions('finance:read')
  summary(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    const q = parse(monthQuery, query);
    const t = today(ctx.org!.timezone);
    const from = q.from ?? t.slice(0, 8) + '01';
    const to = q.to ?? t;
    return this.tenant.run(ctx, async (tx) => {
      const r = await tx.execute<{ income: number; expenses: number; pending: number; overdue: number; payments: number }>(sql`
        select
          (select coalesce(sum(amount), 0)::int from payments where not voided and paid_at between ${from} and ${to}) as income,
          (select count(*)::int from payments where not voided and paid_at between ${from} and ${to}) as payments,
          (select coalesce(sum(amount), 0)::int from expenses where spent_at between ${from} and ${to}) as expenses,
          (select coalesce(sum(ch.amount - ch.discount - coalesce((select sum(a.amount) from payment_allocations a join payments p on p.id = a.payment_id where a.charge_id = ch.id and not p.voided), 0)), 0)::int
             from charges ch where not ch.cancelled) as pending,
          (select coalesce(sum(ch.amount - ch.discount - coalesce((select sum(a.amount) from payment_allocations a join payments p on p.id = a.payment_id where a.charge_id = ch.id and not p.voided), 0)), 0)::int
             from charges ch where not ch.cancelled and ch.due_date < ${t}) as overdue`);
      return { from, to, ...r.rows[0] };
    });
  }

  // ─────────────── Dashboard ───────────────

  /** Indicadores del panel principal, calculados en el momento desde la base. */
  @Get('dashboard')
  dashboard(@Ctx() ctx: RequestContext) {
    const tz = ctx.org!.timezone;
    const t = today(tz);
    const monthStart = t.slice(0, 8) + '01';
    const dayStart = new Date(`${t}T00:00:00-03:00`);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const canFinance = ctx.membership!.permissions.has('finance:read');
    const own = ctx.membership!.scopeOwn ? ctx.user.id : null;
    const sessScope = own ? sql`and s.trainer_id = ${own}` : sql``;
    return this.tenant.run(ctx, async (tx) => {
      const k = await tx.execute<Record<string, number>>(sql`
        select
          (select count(*)::int from clients where deleted_at is null and status = 'ACTIVE') as clients,
          (select count(*)::int from clients where deleted_at is null and created_at >= ${monthStart}::date) as new_clients,
          (select count(*)::int from pets where deleted_at is null and status = 'ACTIVE') as pets,
          (select count(distinct pet_id)::int from programs where status = 'ACTIVE') as pets_training,
          (select count(*)::int from programs where status = 'ACTIVE') as active_programs,
          (select count(*)::int from programs p where p.status = 'ACTIVE' and (
              coalesce((select sum(delta) from package_ledger l where l.program_id = p.id), 0) <= 2
              or p.expires_at <= (${t}::date + 7) or p.end_date <= (${t}::date + 7))) as programs_ending,
          (select count(*)::int from training_sessions s where s.starts_at >= ${dayStart} and s.starts_at < ${dayEnd} and s.status <> 'CANCELLED' ${sessScope}) as sessions_today,
          (select count(*)::int from training_sessions s where s.status = 'DONE' and s.starts_at >= ${monthStart}::date ${sessScope}) as sessions_done_month,
          (select count(*)::int from training_sessions s where s.status = 'CANCELLED' and s.starts_at >= ${monthStart}::date ${sessScope}) as sessions_cancelled_month,
          (select count(*)::int from training_sessions s where s.status = 'NO_SHOW' and s.starts_at >= ${monthStart}::date ${sessScope}) as sessions_no_show_month`);

      const next = await tx.execute(sql`
        select s.id, s.starts_at, s.status, s.modality, p.name as pet, p.alerts, u.name as trainer, sv.name as service,
               (select count(*)::int from training_sessions s2 where s2.program_id = s.program_id and s2.status in ('SCHEDULED','CONFIRMED','DONE') and s2.starts_at <= s.starts_at) as n,
               pr.sessions_contracted as total
        from training_sessions s join pets p on p.id = s.pet_id left join users u on u.id = s.trainer_id
        left join programs pr on pr.id = s.program_id left join services sv on sv.id = pr.service_id
        where s.starts_at >= ${new Date(Date.now() - 3600_000)} and s.starts_at < ${dayEnd} and s.status in ('SCHEDULED','CONFIRMED') ${sessScope}
        order by s.starts_at limit 6`);

      const topServices = await tx
        .select({ name: services.name, n: sql<number>`count(*)::int` })
        .from(programs)
        .innerJoin(services, eq(services.id, programs.serviceId))
        .where(gte(programs.startDate, sql`(${t}::date - interval '12 months')::date`))
        .groupBy(services.name)
        .orderBy(desc(sql`count(*)`))
        .limit(5);

      const monthly = await tx.execute<{ month: string; sessions: number; new_clients: number; income: number }>(sql`
        with m as (select generate_series(date_trunc('month', ${t}::date) - interval '5 months', date_trunc('month', ${t}::date), interval '1 month')::date as month)
        select to_char(m.month, 'YYYY-MM') as month,
          (select count(*)::int from training_sessions s where s.status = 'DONE' and date_trunc('month', s.starts_at at time zone ${tz}) = m.month ${sessScope}) as sessions,
          (select count(*)::int from clients c where c.deleted_at is null and date_trunc('month', c.created_at at time zone ${tz}) = m.month) as new_clients,
          ${canFinance ? sql`(select coalesce(sum(amount), 0)::int from payments p where not p.voided and date_trunc('month', p.paid_at) = m.month)` : sql`0`} as income
        from m order by m.month`);

      // Alertas: vacunas vencidas de mascotas con sesión en los próximos 7 días y paquetes agotados.
      const vaccine = await tx.execute<{ pet: string; vaccine: string; starts_at: string }>(sql`
        select distinct on (p.id) p.name as pet, v->>'name' as vaccine, s.starts_at
        from training_sessions s join pets p on p.id = s.pet_id, jsonb_array_elements(coalesce(p.health->'vaccines', '[]'::jsonb)) v
        where s.status in ('SCHEDULED','CONFIRMED') and s.starts_at between now() and now() + interval '7 days'
          and (v->>'expires') is not null and (v->>'expires') < ${t} ${sessScope}
        order by p.id, s.starts_at limit 5`);
      const empty = await tx.execute<{ pet: string; service: string }>(sql`
        select p.name as pet, sv.name as service from programs pr join pets p on p.id = pr.pet_id join services sv on sv.id = pr.service_id
        where pr.status = 'ACTIVE' and coalesce((select sum(delta) from package_ledger l where l.program_id = pr.id), 0) <= 0
          ${own ? sql`and pr.trainer_id = ${own}` : sql``} limit 5`);

      let finance = null;
      if (canFinance) {
        const f = await tx.execute<{ income: number; pending: number; overdue: number; overdue_count: number; pending_clients: number }>(sql`
          with c as (
            select ch.client_id, ch.due_date, ch.amount - ch.discount - coalesce((select sum(a.amount) from payment_allocations a join payments p on p.id = a.payment_id where a.charge_id = ch.id and not p.voided), 0) as pending
            from charges ch where not ch.cancelled)
          select
            (select coalesce(sum(amount), 0)::int from payments where not voided and paid_at >= ${monthStart}::date) as income,
            (select coalesce(sum(pending), 0)::int from c) as pending,
            (select coalesce(sum(pending), 0)::int from c where due_date < ${t}) as overdue,
            (select count(*)::int from c where pending > 0 and due_date < ${t}) as overdue_count,
            (select count(distinct client_id)::int from c where pending > 0) as pending_clients`);
        finance = f.rows[0];
      }

      const activity = ctx.membership!.permissions.has('audit:read')
        ? (
            await tx.execute(sql`select action, actor_name, created_at from audit_logs
                                 where action not in ('auth.login') order by created_at desc limit 8`)
          ).rows
        : [];

      return {
        kpis: k.rows[0],
        finance,
        next: next.rows,
        topServices,
        monthly: monthly.rows,
        alerts: { vaccines: vaccine.rows, emptyPackages: empty.rows },
        activity,
      };
    });
  }
}

