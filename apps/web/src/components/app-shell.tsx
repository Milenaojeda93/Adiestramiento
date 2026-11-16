'use client';

import { ClipboardList, Home, LogOut, Menu, Settings, ShieldCheck, Users, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useState } from 'react';
import { api } from '@/lib/api';
import { daysUntil, fmtDate } from '@/lib/format';
import { useMe } from '@/lib/me';
import { Logo } from './logo';
import { Alert, cx } from './ui';

interface NavItem {
  href: string;
  label: string;
  icon: typeof Home;
  permission?: string;
}

/** Solo módulos ya construidos: nada en el menú sin funcionamiento real detrás. */
const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Inicio', items: [{ href: '/inicio', label: 'Inicio', icon: Home }] },
  { group: 'Clientes', items: [{ href: '/clientes', label: 'Propietarios', icon: UserRound, permission: 'clients:read' }] },
  {
    group: 'Gestión',
    items: [
      { href: '/equipo', label: 'Equipo y roles', icon: Users, permission: 'users:read' },
      { href: '/auditoria', label: 'Auditoría', icon: ClipboardList, permission: 'audit:read' },
      { href: '/configuracion', label: 'Configuración', icon: Settings, permission: 'settings:read' },
    ],
  },
];

export function AppShell({ children, subscription }: { children: ReactNode; subscription?: { status: string; trialEndsAt: string | null } | null }) {
  const { me, can } = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.assign('/ingresar');
  }

  async function exitSupport() {
    await api('/saas/support/exit', { method: 'POST' });
    window.location.assign('/plataforma');
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    router.push(`/clientes?q=${encodeURIComponent(q.trim())}`);
  }

  const initials = me.user.name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const nav = (
    <nav aria-label="Menú principal" className="flex flex-col gap-[18px]">
      {NAV.map((g) => {
        const items = g.items.filter((i) => !i.permission || can(i.permission));
        if (!items.length) return null;
        return (
          <div key={g.group} className="flex flex-col gap-0.5">
            <span className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[.06em] text-faint">{g.group}</span>
            {items.map((i) => {
              const active = pathname === i.href || pathname.startsWith(i.href + '/');
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm',
                    active ? 'bg-brand-soft font-semibold text-brand-dark' : 'font-medium text-[#44403c] hover:bg-line-soft',
                  )}
                >
                  <i.icon size={18} strokeWidth={1.8} aria-hidden />
                  {i.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  const trialDays = subscription?.status === 'TRIAL' && subscription.trialEndsAt ? daysUntil(subscription.trialEndsAt) : null;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col gap-5 border-r border-line bg-white px-3.5 py-5 lg:flex">
        <div className="px-2">
          <Logo subtitle={me.organization?.name} />
        </div>
        {nav}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="flex h-full w-72 flex-col gap-5 bg-white px-3.5 py-5" onClick={(e) => e.stopPropagation()}>
            <div className="px-2">
              <Logo subtitle={me.organization?.name} />
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {me.impersonating && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-ink px-6 py-2 text-sm text-white">
            <span className="flex items-center gap-2">
              <ShieldCheck size={16} aria-hidden /> Modo soporte en {me.organization?.name}: solo lectura, todo queda auditado.
            </span>
            <button onClick={exitSupport} className="rounded-md bg-white/15 px-3 py-1 font-semibold hover:bg-white/25">
              Salir del modo soporte
            </button>
          </div>
        )}
        <header className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-3 sm:px-8">
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg border border-line lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú">
            <Menu size={18} aria-hidden />
          </button>
          {can('clients:read') && (
            <form onSubmit={onSearch} role="search" className="flex min-w-0 flex-[1_1_280px]">
              <label htmlFor="buscar-global" className="sr-only">
                Buscar cliente
              </label>
              <input
                id="buscar-global"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar cliente por nombre, documento o teléfono"
                className="h-10 w-full rounded-[10px] border border-line bg-ground px-3 text-sm"
              />
            </form>
          )}
          <div className="ml-auto flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{initials}</div>
            <div className="hidden flex-col text-[13px] leading-tight sm:flex">
              <span className="font-semibold">{me.user.name}</span>
              <span className="text-muted">{me.role?.name}</span>
            </div>
            <button type="button" onClick={logout} className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-muted hover:bg-line-soft" aria-label="Cerrar sesión">
              <LogOut size={16} aria-hidden />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </header>

        <main className="flex w-full max-w-[1240px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-7">
          {me.organization?.readOnly && !me.impersonating && (
            <Alert tone="red" title="Cuenta en solo lectura.">
              La suscripción está vencida o suspendida. Podés consultar tus datos, pero no modificarlos. Escribinos para reactivarla.
            </Alert>
          )}
          {trialDays !== null && trialDays >= 0 && trialDays <= 7 && !me.organization?.readOnly && (
            <Alert tone="amber" title={`Tu prueba termina el ${fmtDate(subscription!.trialEndsAt)}.`}>
              Te quedan {trialDays} {trialDays === 1 ? 'día' : 'días'}.
            </Alert>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
