'use client';

import { LogOut } from 'lucide-react';
import { FormEvent, useState } from 'react';
import useSWR from 'swr';
import { PawIcon } from '@/components/logo';
import { Alert, Badge, Button, Card, Modal, PageHeader, TextInput } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { MeProvider, useMe } from '@/lib/me';

interface OrgRow {
  id: string;
  name: string;
  email: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  isDemo: boolean;
  createdAt: string;
  plan: { id: string; name: string; code: string } | null;
  subscription: { status: string; trialEndsAt: string | null; currentPeriodEnd: string | null; lastPaymentAt: string | null; lastPaymentNote: string | null } | null;
  users: number;
  clients: number;
}
interface Metrics {
  active: number;
  trial: number;
  suspended: number;
  users: number;
  clients: number;
}
interface Plans {
  plans: { id: string; name: string; code: string }[];
}

const SUB: Record<string, { label: string; tone: 'green' | 'blue' | 'amber' | 'red' }> = {
  TRIAL: { label: 'Prueba', tone: 'blue' },
  ACTIVE: { label: 'Activa', tone: 'green' },
  PAST_DUE: { label: 'Pago atrasado', tone: 'amber' },
  SUSPENDED: { label: 'Suspendida', tone: 'red' },
  CANCELLED: { label: 'Cancelada', tone: 'red' },
};

function PaymentForm({ org, onDone }: { org: OrgRow; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const next = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const [form, setForm] = useState({ paidAt: today, periodEnd: next, note: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/saas/organizations/${org.id}/payments`, { method: 'POST', body: form });
      onDone();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setSaving(false);
    }
  }
  const fe = error?.fieldErrors ?? {};
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Alert tone="amber">No se cobra nada: solo registra un pago que ya recibiste por otro medio.</Alert>
      <TextInput label="Fecha del pago" type="date" value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} error={fe.paidAt} />
      <TextInput label="Suscripción paga hasta" type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} error={fe.periodEnd} />
      <TextInput label="Medio y referencia" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} error={fe.note} placeholder="Transferencia Banco X, ref. 123456" />
      <Button type="submit" loading={saving} className="self-end">
        Registrar pago
      </Button>
    </form>
  );
}

function SupportForm({ org }: { org: OrgRow }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/saas/organizations/${org.id}/support`, { method: 'POST', body: { reason } });
      window.location.assign('/inicio');
    } catch (err) {
      setError(err as ApiError);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted">Vas a ver los datos de {org.name} en solo lectura. El ingreso y el motivo quedan en la auditoría de la empresa.</p>
      <TextInput label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} error={error?.fieldErrors.reason ?? error?.message} />
      <Button type="submit" className="self-end">
        Entrar en modo soporte
      </Button>
    </form>
  );
}

function Plataforma() {
  const { me } = useMe();
  const { data: orgs, mutate } = useSWR<OrgRow[]>('/saas/organizations', fetcher);
  const { data: metrics, mutate: refreshMetrics } = useSWR<Metrics>('/saas/metrics', fetcher);
  const { data: plans } = useSWR<Plans>('/saas/plans', fetcher);
  const [modal, setModal] = useState<null | { kind: 'payment' | 'support'; org: OrgRow }>(null);
  const [notice, setNotice] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  async function patch(org: OrgRow, body: Record<string, unknown>, msg: string) {
    try {
      await api(`/saas/organizations/${org.id}`, { method: 'PATCH', body });
      setNotice({ tone: 'green', text: msg });
      mutate();
      refreshMetrics();
    } catch (err) {
      setNotice({ tone: 'red', text: (err as ApiError).message });
    }
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.assign('/ingresar');
  }

  const stats = metrics
    ? [
        ['Empresas con suscripción activa', metrics.active],
        ['En período de prueba', metrics.trial],
        ['Suspendidas', metrics.suspended],
        ['Usuarios activos', metrics.users],
        ['Clientes registrados', metrics.clients],
      ]
    : [];

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-4 bg-ink px-6 py-3 text-white sm:px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-brand">
            <PawIcon size={18} />
          </div>
          <span className="font-bold">Adiestra</span>
          <span className="rounded-md bg-[#3a3532] px-2 py-0.5 text-xs font-semibold text-[#e7e5e4]">Plataforma</span>
        </div>
        <span className="ml-auto text-[13px] text-[#d6d3d1]">{me.user.name}</span>
        <button onClick={logout} className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-[#d6d3d1] hover:bg-white/10">
          <LogOut size={16} aria-hidden /> Salir
        </button>
      </header>
      <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 px-4 py-7 sm:px-8">
        <PageHeader title="Empresas" />
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
          {stats.map(([l, v]) => (
            <Card key={l as string} className="flex flex-col gap-1 px-[18px] py-4">
              <span className="text-[13px] text-muted">{l}</span>
              <span className="text-2xl font-bold">{v}</span>
            </Card>
          ))}
        </div>
        <Alert tone="amber" title="Pasarela de pago pendiente de configuración.">
          Los pagos de suscripción se registran a mano y quedan auditados hasta integrar una pasarela real.
        </Alert>
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="bg-[#fafaf8] text-left text-xs text-muted">
                  <th scope="col" className="px-4 py-2.5 font-semibold">Empresa</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">Plan</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">Suscripción</th>
                  <th scope="col" className="px-2 py-2.5 text-right font-semibold">Usuarios</th>
                  <th scope="col" className="px-2 py-2.5 text-right font-semibold">Clientes</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">Último pago</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {(orgs ?? []).map((o) => {
                  const sub = o.subscription ? SUB[o.subscription.status] : null;
                  return (
                    <tr key={o.id} className="border-t border-line-soft align-top">
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{o.name}</span>
                          {o.status === 'SUSPENDED' && <Badge tone="red">Suspendida</Badge>}
                          {o.isDemo && <Badge tone="blue">Demo</Badge>}
                        </div>
                        <span className="text-xs text-muted">{o.email} · alta {fmtDate(o.createdAt)}</span>
                      </td>
                      <td className="px-2 py-3">
                        {plans && o.plan ? (
                          <>
                            <label htmlFor={`plan-${o.id}`} className="sr-only">
                              Plan de {o.name}
                            </label>
                            <select
                              id={`plan-${o.id}`}
                              value={o.plan.id}
                              onChange={(e) => patch(o, { planId: e.target.value }, `${o.name} cambió de plan.`)}
                              className="h-9 rounded-lg border border-line bg-white px-2 text-sm"
                            >
                              {plans.plans.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </>
                        ) : (
                          o.plan?.name
                        )}
                      </td>
                      <td className="px-2 py-3">
                        {sub && <Badge tone={sub.tone}>{sub.label}</Badge>}
                        <div className="mt-1 text-xs text-muted">
                          {o.subscription?.status === 'TRIAL' ? `hasta ${fmtDate(o.subscription.trialEndsAt)}` : o.subscription?.currentPeriodEnd ? `vence ${fmtDate(o.subscription.currentPeriodEnd)}` : ''}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-right">{o.users}</td>
                      <td className="px-2 py-3 text-right">{o.clients}</td>
                      <td className="max-w-[220px] px-2 py-3 text-xs text-muted">
                        {o.subscription?.lastPaymentAt ? `${fmtDate(o.subscription.lastPaymentAt)} · ${o.subscription.lastPaymentNote}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button variant="ghost" className="h-9 px-3 text-[13px]" onClick={() => setModal({ kind: 'payment', org: o })}>
                            Registrar pago
                          </Button>
                          <Button variant="ghost" className="h-9 px-3 text-[13px]" onClick={() => setModal({ kind: 'support', org: o })}>
                            Soporte
                          </Button>
                          {o.status === 'ACTIVE' ? (
                            <Button variant="ghost" className="h-9 px-3 text-[13px] text-danger-ink" onClick={() => patch(o, { status: 'SUSPENDED' }, `${o.name} quedó suspendida (solo lectura).`)}>
                              Suspender
                            </Button>
                          ) : (
                            <Button variant="ghost" className="h-9 px-3 text-[13px] text-brand" onClick={() => patch(o, { status: 'ACTIVE' }, `${o.name} está activa de nuevo.`)}>
                              Reactivar
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.kind === 'payment' ? `Registrar pago · ${modal.org.name}` : `Modo soporte · ${modal?.org.name ?? ''}`}>
        {modal?.kind === 'payment' && (
          <PaymentForm
            org={modal.org}
            onDone={() => {
              setModal(null);
              setNotice({ tone: 'green', text: 'Pago registrado. La suscripción quedó activa.' });
              mutate();
              refreshMetrics();
            }}
          />
        )}
        {modal?.kind === 'support' && <SupportForm org={modal.org} />}
      </Modal>
    </div>
  );
}

export default function PlataformaPage() {
  return (
    <MeProvider platform>
      <Plataforma />
    </MeProvider>
  );
}
