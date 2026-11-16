'use client';

import { formatMoney, PAYMENT_METHOD_LABELS } from '@adiestra/shared';
import { MessageCircle, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import useSWR from 'swr';
import { PaymentForm } from '@/components/forms';
import { Alert, Badge, Button, Card, EmptyState, Modal, PageHeader, TextInput } from '@/components/ui';
import { Tabs } from '@/components/widgets';
import { api, ApiError, fetcher } from '@/lib/api';
import { fmtIsoDate, todayIso, waLink } from '@/lib/format';
import { useMe } from '@/lib/me';

interface BalanceRow {
  client_id: string;
  name: string;
  phone: string;
  charged: number;
  paid: number;
  balance: number;
  overdue: number;
  next_due: string | null;
  oldest_overdue: string | null;
}
interface PaymentRow {
  id: string;
  receiptNumber: number;
  amount: number;
  method: keyof typeof PAYMENT_METHOD_LABELS;
  paidAt: string;
  reference: string | null;
  voided: boolean;
  client: { id: string; firstName: string; lastName: string };
}
interface ExpenseRow {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  spentAt: string;
}

const monthStart = () => todayIso().slice(0, 8) + '01';

function ExpenseForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ category: '', description: '', amount: '', spentAt: todayIso() });
  const [error, setError] = useState<ApiError | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/expenses', { method: 'POST', body: { ...f, description: f.description || null, amount: Number(f.amount || 0) } });
      onDone();
    } catch (err) {
      setError(err as ApiError);
    }
  }
  const fe = error?.fieldErrors ?? {};
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && !Object.keys(fe).length && <Alert tone="red">{error.message}</Alert>}
      <TextInput label="Categoría" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} error={fe.category} list="exp-cats" />
      <datalist id="exp-cats">
        {['Alquiler', 'Premios y alimento', 'Combustible', 'Equipamiento', 'Sueldos', 'Publicidad', 'Servicios'].map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <TextInput label="Detalle (opcional)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Monto (Gs.)"
          inputMode="numeric"
          value={f.amount ? Number(f.amount).toLocaleString('es-PY') : ''}
          onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })}
          error={fe.amount}
        />
        <TextInput label="Fecha" type="date" value={f.spentAt} onChange={(e) => setF({ ...f, spentAt: e.target.value })} />
      </div>
      <Button type="submit" className="self-end">
        Registrar egreso
      </Button>
    </form>
  );
}

export default function CobrosPage() {
  const { can, me } = useMe();
  const router = useRouter();
  const ro = me.organization?.readOnly;
  const [tab, setTab] = useState<'saldos' | 'pagos' | 'egresos'>('saldos');
  const [filter, setFilter] = useState<'DEBT' | 'OVERDUE' | 'ALL'>('DEBT');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayIso());
  const { data: summary, mutate: refreshSummary } = useSWR<{ income: number; expenses: number; pending: number; overdue: number; payments: number }>(`/finance/summary?from=${from}&to=${to}`, fetcher);
  const { data: balances, mutate: refreshBalances } = useSWR<BalanceRow[]>(tab === 'saldos' ? `/finance/balances?filter=${filter}` : null, fetcher);
  const { data: paymentsList } = useSWR<PaymentRow[]>(tab === 'pagos' ? `/payments?from=${from}&to=${to}` : null, fetcher);
  const { data: expensesList, mutate: refreshExpenses } = useSWR<ExpenseRow[]>(tab === 'egresos' ? `/expenses?from=${from}&to=${to}` : null, fetcher);
  const [paying, setPaying] = useState<BalanceRow | null>(null);
  const [addingExpense, setAddingExpense] = useState(false);
  const t = todayIso();

  return (
    <>
      <PageHeader
        title="Cobros y egresos"
        actions={
          can('finance:create') && !ro ? (
            <Button variant="secondary" onClick={() => setAddingExpense(true)}>
              <Plus size={16} aria-hidden /> Egreso
            </Button>
          ) : null
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <TextInput label="Desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextInput label="Hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <Card className="flex flex-col gap-1 px-[18px] py-4">
          <span className="text-[13px] text-muted">Cobrado en el período</span>
          <span className="text-2xl font-bold">{summary ? formatMoney(summary.income) : '—'}</span>
          <span className="text-xs text-muted">{summary?.payments ?? 0} pagos</span>
        </Card>
        <Card className="flex flex-col gap-1 px-[18px] py-4">
          <span className="text-[13px] text-muted">Egresos del período</span>
          <span className="text-2xl font-bold">{summary ? formatMoney(summary.expenses) : '—'}</span>
          <span className="text-xs text-muted">Resultado: {summary ? formatMoney(summary.income - summary.expenses) : '—'}</span>
        </Card>
        <Card className="flex flex-col gap-1 px-[18px] py-4">
          <span className="text-[13px] text-muted">Por cobrar (total)</span>
          <span className="text-2xl font-bold">{summary ? formatMoney(summary.pending) : '—'}</span>
        </Card>
        <Card className={`flex flex-col gap-1 px-[18px] py-4 ${summary && summary.overdue > 0 ? 'border-[#f2c9a4]' : ''}`}>
          <span className="text-[13px] text-warn-ink">Vencido</span>
          <span className="text-2xl font-bold text-warn-ink">{summary ? formatMoney(summary.overdue) : '—'}</span>
        </Card>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ['saldos', 'Saldos por cliente'],
          ['pagos', 'Pagos y recibos'],
          ['egresos', 'Egresos'],
        ]}
      />

      {tab === 'saldos' && (
        <Card>
          <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
            {(
              [
                ['DEBT', 'Con saldo'],
                ['OVERDUE', 'Vencidos'],
                ['ALL', 'Todos'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)} className={`h-9 rounded-[10px] px-3 text-[13px] ${filter === v ? 'border border-brand bg-brand-soft font-semibold text-brand-dark' : 'border border-line bg-white'}`}>
                {l}
              </button>
            ))}
          </div>
          {!balances ? (
            <div className="p-10 text-center text-sm text-muted">Cargando…</div>
          ) : balances.length === 0 ? (
            <EmptyState title="Nadie debe nada">No hay clientes con saldo pendiente en este filtro.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="bg-[#fafaf8] text-left text-xs text-muted">
                    <th className="px-4 py-2.5 font-semibold">Cliente</th>
                    <th className="px-2 py-2.5 font-semibold">Próximo vencimiento</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Vencido</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Saldo</th>
                    <th className="px-4 py-2.5">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.client_id} className="border-t border-line-soft">
                      <td className="px-4 py-3">
                        <Link href={`/clientes/${b.client_id}`} className="font-semibold text-brand">
                          {b.name}
                        </Link>
                      </td>
                      <td className="px-2 py-3">
                        {b.next_due ? fmtIsoDate(b.next_due) : '—'}
                        {b.oldest_overdue && (
                          <span className="ml-2">
                            <Badge tone="red">Vencido hace {Math.round((Date.parse(t) - Date.parse(b.oldest_overdue)) / 86400000)} días</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-right font-semibold text-danger-ink">{b.overdue > 0 ? formatMoney(b.overdue) : ''}</td>
                      <td className="px-2 py-3 text-right font-semibold">{formatMoney(b.balance)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {b.phone && b.balance > 0 && (
                            <a
                              href={`${waLink(b.phone)}?text=${encodeURIComponent(`Hola ${b.name.split(' ')[0]}, te recordamos que tenés un saldo pendiente de ${formatMoney(b.balance)}. ¡Gracias!`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Recordar por WhatsApp a ${b.name}`}
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-brand hover:bg-brand-soft"
                            >
                              <MessageCircle size={17} aria-hidden />
                            </a>
                          )}
                          {can('finance:create') && !ro && b.balance > 0 && (
                            <Button variant="secondary" className="h-9 text-[13px]" onClick={() => setPaying(b)}>
                              Registrar pago
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'pagos' && (
        <Card>
          {!paymentsList ? (
            <div className="p-10 text-center text-sm text-muted">Cargando…</div>
          ) : paymentsList.length === 0 ? (
            <EmptyState title="Sin pagos en el período" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {paymentsList.map((p) => (
                <li key={p.id}>
                  <Link href={`/recibos/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-ground">
                    <span className="flex flex-col">
                      <span className="font-semibold">
                        {p.client.firstName} {p.client.lastName} {p.voided && <Badge tone="red">Anulado</Badge>}
                      </span>
                      <span className="text-xs text-muted">
                        Recibo N.º {String(p.receiptNumber).padStart(6, '0')} · {fmtIsoDate(p.paidAt)} · {PAYMENT_METHOD_LABELS[p.method]}
                      </span>
                    </span>
                    <span className={p.voided ? 'text-muted line-through' : 'font-semibold'}>{formatMoney(p.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'egresos' && (
        <Card>
          {!expensesList ? (
            <div className="p-10 text-center text-sm text-muted">Cargando…</div>
          ) : expensesList.length === 0 ? (
            <EmptyState title="Sin egresos en el período" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {expensesList.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <span className="flex flex-col">
                    <span className="font-semibold">{x.category}</span>
                    <span className="text-xs text-muted">
                      {fmtIsoDate(x.spentAt)}
                      {x.description ? ` · ${x.description}` : ''}
                    </span>
                  </span>
                  <span className="font-semibold">{formatMoney(x.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Modal open={!!paying} onClose={() => setPaying(null)} title="Registrar pago">
        {paying && (
          <PaymentForm
            clientId={paying.client_id}
            clientName={paying.name}
            debt={paying.balance}
            onCancel={() => setPaying(null)}
            onDone={(id) => {
              setPaying(null);
              refreshBalances();
              refreshSummary();
              router.push(`/recibos/${id}`);
            }}
          />
        )}
      </Modal>
      <Modal open={addingExpense} onClose={() => setAddingExpense(false)} title="Nuevo egreso">
        {addingExpense && (
          <ExpenseForm
            onDone={() => {
              setAddingExpense(false);
              refreshExpenses();
              refreshSummary();
              setTab('egresos');
            }}
          />
        )}
      </Modal>
    </>
  );
}
