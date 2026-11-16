'use client';

import { formatMoney } from '@adiestra/shared';
import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';
import { Card, PageHeader } from '@/components/ui';
import { fetcher } from '@/lib/api';
import { fmtDateTime, fmtTime } from '@/lib/format';
import { useMe } from '@/lib/me';

interface Dashboard {
  kpis: Record<string, number>;
  finance: null | { income: number; pending: number; overdue: number; overdue_count: number; pending_clients: number };
  next: { id: string; starts_at: string; status: string; pet: string; alerts: string[]; trainer: string | null; service: string | null; n: number | null; total: number | null }[];
  topServices: { name: string; n: number }[];
  monthly: { month: string; sessions: number; new_clients: number; income: number }[];
  alerts: { vaccines: { pet: string; vaccine: string; starts_at: string }[]; emptyPackages: { pet: string; service: string }[] };
  activity: { action: string; actor_name: string | null; created_at: string }[];
}

const ACTIONS: Record<string, string> = {
  'client.create': 'registró un cliente',
  'pet.create': 'registró una mascota',
  'pet.update': 'editó los datos de una mascota',
  'pet.health_update': 'actualizó salud y seguridad de una mascota',
  'pet.behavior_update': 'actualizó el perfil conductual de una mascota',
  'pet.guardian_add': 'agregó un responsable a una mascota',
  'service.create': 'creó un servicio',
  'session.confirm': 'confirmó una sesión',
  'program.package_adjust': 'ajustó un paquete',
  'organization.update': 'editó los datos de la empresa',
  'assessment.create': 'cargó una evaluación inicial',
  'program.create': 'creó un programa',
  'session.create': 'agendó sesiones',
  'session.record': 'registró una sesión',
  'session.no_show': 'marcó una ausencia',
  'session.cancel': 'canceló una sesión',
  'session.cancel_late': 'canceló una sesión fuera de plazo',
  'session.reschedule': 'reprogramó una sesión',
  'payment.create': 'registró un pago',
  'payment.void': 'anuló un pago',
  'expense.create': 'registró un egreso',
  'user.invite': 'sumó a una persona al equipo',
  'organization.signup': 'creó la cuenta',
};
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function Kpi({ label, value, note, href, tone }: { label: string; value: string | number; note?: string; href?: string; tone?: 'warn' | 'good' }) {
  const body = (
    <Card className="flex h-full flex-col gap-1.5 p-[18px] transition-colors hover:border-[#d6d3ce]">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-[26px] font-bold tracking-tight">{value}</span>
      {note && <span className={`text-xs ${tone === 'warn' ? 'font-medium text-warn-ink' : tone === 'good' ? 'font-medium text-brand' : 'text-muted'}`}>{note}</span>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Bars({ data, label, format }: { data: { label: string; value: number }[]; label: string; format: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex flex-col gap-2" role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${format(d.value)}`).join(', ')}`}>
      <div className="flex h-44 items-end gap-3 border-b border-line px-1">
        {data.map((d, i) => (
          <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[11px] font-medium text-muted">{d.value ? format(d.value) : ''}</span>
            <div className="w-full max-w-12 rounded-t-md" style={{ height: `${(d.value / max) * 130}px`, background: i === data.length - 1 ? '#2f6b4f' : '#a9c8b6' }} />
          </div>
        ))}
      </div>
      <div className="flex gap-3 px-1">
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center text-xs text-muted">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function InicioPage() {
  const { me, can } = useMe();
  const { data: d } = useSWR<Dashboard>('/dashboard', fetcher, { refreshInterval: 120_000 });
  const today = new Intl.DateTimeFormat('es-PY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Asuncion' }).format(new Date());
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Asuncion' }).format(new Date()));
  const greet = hour < 12 ? 'Buen día' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const k = d?.kpis;

  const steps = d
    ? [
        { done: (k?.clients ?? 0) > 0, label: 'Registrá tu primer cliente', href: '/clientes?nuevo=1', show: can('clients:create') },
        { done: (k?.pets ?? 0) > 0, label: 'Sumá su mascota', href: '/mascotas?nuevo=1', show: can('pets:create') },
        { done: d.topServices.length > 0 || (k?.active_programs ?? 0) > 0, label: 'Cargá tus servicios y creá un programa', href: '/servicios', show: can('services:create') },
        { done: (k?.sessions_today ?? 0) > 0 || (k?.sessions_done_month ?? 0) > 0, label: 'Agendá la primera sesión', href: '/agenda?nueva=1', show: can('agenda:create') },
      ].filter((s) => s.show)
    : [];
  const showSteps = steps.length > 0 && steps.filter((s) => s.done).length < steps.length;

  return (
    <>
      <PageHeader
        subtitle={today.charAt(0).toUpperCase() + today.slice(1)}
        title={`${greet}, ${me.user.name.split(' ')[0]}`}
        actions={
          <>
            {can('clients:create') && (
              <Link href="/clientes?nuevo=1" className="inline-flex h-11 items-center rounded-[10px] border border-line bg-white px-4 text-sm font-medium hover:bg-ground">
                + Cliente
              </Link>
            )}
            {can('pets:create') && (
              <Link href="/mascotas?nuevo=1" className="inline-flex h-11 items-center rounded-[10px] border border-line bg-white px-4 text-sm font-medium hover:bg-ground">
                + Mascota
              </Link>
            )}
            {can('agenda:create') && (
              <Link href="/agenda?nueva=1" className="inline-flex h-11 items-center rounded-[10px] bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">
                + Nueva sesión
              </Link>
            )}
          </>
        }
      />

      {showSteps && (
        <Card className="flex flex-col gap-1 p-5">
          <h2 className="mb-2 text-base font-semibold">Primeros pasos</h2>
          {steps.map((s) => (
            <Link key={s.label} href={s.href} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-ground">
              {s.done ? <CheckCircle2 size={20} className="text-brand" aria-label="Hecho" /> : <Circle size={20} className="text-[#a8a29e]" aria-label="Pendiente" />}
              <span className={s.done ? 'text-muted line-through' : 'font-medium'}>{s.label}</span>
            </Link>
          ))}
        </Card>
      )}

      {k && (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
          <Kpi label="Clientes activos" value={k.clients} note={k.new_clients ? `+${k.new_clients} este mes` : undefined} tone="good" href="/clientes" />
          <Kpi label="Mascotas" value={k.pets} note={`${k.pets_training} en entrenamiento`} href="/mascotas" />
          <Kpi label="Programas activos" value={k.active_programs} note={k.programs_ending ? `${k.programs_ending} por terminar` : undefined} tone="warn" href="/programas" />
          <Kpi label="Sesiones hoy" value={k.sessions_today} href="/agenda" />
          <Kpi label="Sesiones realizadas este mes" value={k.sessions_done_month} note={`${k.sessions_cancelled_month} canceladas · ${k.sessions_no_show_month} ausencias`} />
          {d.finance && (
            <>
              <Kpi label="Cobrado este mes" value={formatMoney(d.finance.income)} href="/cobros" />
              <Kpi
                label="Pagos pendientes"
                value={formatMoney(d.finance.pending)}
                note={d.finance.overdue_count ? `${d.finance.overdue_count} cuotas vencidas · ${formatMoney(d.finance.overdue)}` : `${d.finance.pending_clients} ${d.finance.pending_clients === 1 ? 'cliente' : 'clientes'}`}
                tone={d.finance.overdue_count ? 'warn' : undefined}
                href="/cobros"
              />
            </>
          )}
        </div>
      )}

      {d && (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">{d.finance ? 'Ingresos mensuales' : 'Sesiones realizadas'}</h2>
              <span className="text-xs text-muted">Últimos 6 meses</span>
            </div>
            <Bars
              label={d.finance ? 'Ingresos por mes' : 'Sesiones por mes'}
              data={d.monthly.map((m) => ({ label: MONTHS[Number(m.month.slice(5)) - 1], value: d.finance ? m.income : m.sessions }))}
              format={(v) => (d.finance ? (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace('.', ',')} M` : `${Math.round(v / 1000)} mil`) : String(v))}
            />
          </Card>
          <Card className="flex flex-col gap-1 p-5">
            <div className="flex items-baseline justify-between pb-2">
              <h2 className="text-base font-semibold">Próximas sesiones de hoy</h2>
              <Link href="/agenda" className="text-[13px] font-medium text-brand">
                Ver agenda
              </Link>
            </div>
            {d.next.length === 0 && <p className="py-4 text-sm text-muted">No quedan sesiones por hoy.</p>}
            {d.next.map((s) => (
              <Link key={s.id} href={`/sesiones/${s.id}`} className="flex items-center gap-3 border-t border-line-soft py-2.5 hover:bg-ground">
                <span className="w-12 text-sm font-semibold">{fmtTime(s.starts_at)}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1 text-sm font-medium">
                    {s.alerts?.length > 0 && <AlertTriangle size={13} className="text-danger" aria-label="Tiene avisos" />}
                    {s.pet}
                  </span>
                  <span className="truncate text-xs text-muted">{[s.service, s.n && s.total ? `Sesión ${s.n} de ${s.total}` : null, s.trainer].filter(Boolean).join(' · ')}</span>
                </span>
              </Link>
            ))}
          </Card>
        </div>
      )}

      {d && (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-base font-semibold">Servicios más contratados</h2>
            {d.topServices.length === 0 && <p className="text-sm text-muted">Todavía no hay programas.</p>}
            {d.topServices.map((s) => (
              <div key={s.name} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <span>{s.name}</span>
                  <span className="font-semibold">{s.n}</span>
                </div>
                <div className="h-2 rounded bg-line-soft">
                  <div className="h-2 rounded bg-brand" style={{ width: `${(s.n / d.topServices[0].n) * 100}%` }} />
                </div>
              </div>
            ))}
          </Card>
          <Card className="flex flex-col gap-2.5 p-5">
            <h2 className="text-base font-semibold">Alertas</h2>
            {d.alerts.vaccines.length === 0 && d.alerts.emptyPackages.length === 0 && !(d.finance?.overdue_count) && <p className="text-sm text-muted">Todo en orden.</p>}
            {d.alerts.vaccines.map((v) => (
              <div key={v.pet} className="rounded-[10px] bg-danger-soft p-3 text-sm">
                <strong>{v.pet}: vacuna {v.vaccine} vencida.</strong> Tiene sesión el {fmtDateTime(v.starts_at)}. Pedí el comprobante.
              </div>
            ))}
            {d.alerts.emptyPackages.map((p) => (
              <div key={p.pet + p.service} className="rounded-[10px] bg-info-soft p-3 text-sm">
                <strong>{p.pet}</strong> no tiene sesiones disponibles en {p.service}. Ofrecé renovar o finalizá el programa.
              </div>
            ))}
            {!!d.finance?.overdue_count && (
              <Link href="/cobros" className="rounded-[10px] bg-warn-soft p-3 text-sm">
                <strong>
                  {d.finance.overdue_count} {d.finance.overdue_count === 1 ? 'cuota vencida' : 'cuotas vencidas'}
                </strong>{' '}
                por {formatMoney(d.finance.overdue)}.
              </Link>
            )}
          </Card>
          {d.activity.length > 0 && (
            <Card className="flex flex-col gap-1 p-5">
              <h2 className="mb-2 text-base font-semibold">Actividad reciente</h2>
              {d.activity.map((a, i) => (
                <div key={i} className="flex flex-col border-t border-line-soft py-2">
                  <span className="text-sm">
                    {a.actor_name ?? 'Sistema'} {ACTIONS[a.action] ?? a.action}
                  </span>
                  <span className="text-xs text-muted">{fmtDateTime(a.created_at)}</span>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
      {!d && <div className="p-10 text-center text-sm text-muted">Cargando…</div>}
    </>
  );
}
