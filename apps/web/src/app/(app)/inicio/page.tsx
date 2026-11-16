'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';
import { Badge, Card, PageHeader } from '@/components/ui';
import { fetcher } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { useMe } from '@/lib/me';
import type { Page, Client, TeamMember } from '@/lib/types';

interface OrgInfo {
  organization: { name: string; ruc: string | null; phone: string | null; address: string | null };
  subscription: { status: string; plan: string; trialEndsAt: string | null; currentPeriodEnd: string | null } | null;
}

const SUB_LABEL: Record<string, { label: string; tone: 'green' | 'blue' | 'amber' | 'red' }> = {
  TRIAL: { label: 'Prueba gratuita', tone: 'blue' },
  ACTIVE: { label: 'Activa', tone: 'green' },
  PAST_DUE: { label: 'Pago atrasado', tone: 'amber' },
  SUSPENDED: { label: 'Suspendida', tone: 'red' },
  CANCELLED: { label: 'Cancelada', tone: 'red' },
};

export default function InicioPage() {
  const { me, can } = useMe();
  const { data: clients } = useSWR<Page<Client>>(can('clients:read') ? '/clients?limit=1' : null, fetcher);
  const { data: team } = useSWR<TeamMember[]>(can('users:read') ? '/users' : null, fetcher);
  const { data: org } = useSWR<OrgInfo>('/organization', fetcher);

  const today = new Intl.DateTimeFormat('es-PY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Asuncion' }).format(new Date());
  const firstName = me.user.name.split(' ')[0];
  const sub = org?.subscription;
  const subMeta = sub ? SUB_LABEL[sub.status] : null;

  const steps = [
    { done: !!org?.organization.ruc && !!org.organization.phone, label: 'Completá los datos de tu empresa', href: '/configuracion', show: can('settings:update') },
    { done: (clients?.total ?? 0) > 0, label: 'Registrá tu primer cliente', href: '/clientes?nuevo=1', show: can('clients:create') },
    { done: (team?.length ?? 0) > 1, label: 'Sumá a tu equipo (entrenadores, recepción)', href: '/equipo', show: can('users:create') },
  ].filter((s) => s.show);

  return (
    <>
      <PageHeader subtitle={today.charAt(0).toUpperCase() + today.slice(1)} title={`Buen día, ${firstName}`} />

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {can('clients:read') && (
          <Card className="flex flex-col gap-1.5 p-[18px]">
            <span className="text-[13px] text-muted">Clientes activos</span>
            <span className="text-[26px] font-bold">{clients ? clients.total : '—'}</span>
            <Link href="/clientes" className="text-xs font-medium text-brand">
              Ver propietarios
            </Link>
          </Card>
        )}
        {can('users:read') && (
          <Card className="flex flex-col gap-1.5 p-[18px]">
            <span className="text-[13px] text-muted">Personas en el equipo</span>
            <span className="text-[26px] font-bold">{team ? team.filter((t) => t.active).length : '—'}</span>
            <Link href="/equipo" className="text-xs font-medium text-brand">
              Ver equipo
            </Link>
          </Card>
        )}
        <Card className="flex flex-col gap-1.5 p-[18px]">
          <span className="text-[13px] text-muted">Suscripción</span>
          <span className="text-lg font-bold">{sub?.plan ?? '—'}</span>
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {subMeta && <Badge tone={subMeta.tone}>{subMeta.label}</Badge>}
            {sub?.status === 'TRIAL' && sub.trialEndsAt && <>hasta el {fmtDate(sub.trialEndsAt)}</>}
            {sub?.status === 'ACTIVE' && sub.currentPeriodEnd && <>vence el {fmtDate(sub.currentPeriodEnd)}</>}
          </span>
        </Card>
      </div>

      {steps.length > 0 && steps.some((s) => !s.done) && (
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
    </>
  );
}
