'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import { PawIcon } from '@/components/logo';
import { Badge, Button, Card, EmptyState, Modal, PageHeader } from '@/components/ui';
import { NewPetForm } from '@/components/forms';
import { PetAlerts } from '@/components/widgets';
import { fetcher } from '@/lib/api';
import { age } from '@/lib/format';
import { useMe } from '@/lib/me';
import type { Page, PetListItem } from '@/lib/types';

function MascotasInner() {
  const { can, me } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | 'ALL'>('ACTIVE');
  const [creating, setCreating] = useState(!!params.get('nuevo'));
  const ro = me.organization?.readOnly;

  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, size, setSize, isLoading } = useSWRInfinite<Page<PetListItem>>((i, prev) => {
    if (prev && !prev.nextCursor) return null;
    const qs = new URLSearchParams({ status, limit: '30' });
    if (term) qs.set('search', term);
    if (prev?.nextCursor) qs.set('cursor', prev.nextCursor);
    return `/pets?${qs}`;
  }, fetcher);
  const items = data?.flatMap((p) => p.items) ?? [];
  const total = data?.[0]?.total ?? 0;
  const hasMore = !!data?.[data.length - 1]?.nextCursor;

  return (
    <>
      <PageHeader
        title="Mascotas"
        actions={
          can('pets:create') && !ro ? (
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden /> Nueva mascota
            </Button>
          ) : null
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3.5">
          <label htmlFor="buscar-mascotas" className="sr-only">
            Buscar
          </label>
          <input
            id="buscar-mascotas"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, raza o propietario"
            className="h-10 min-w-0 flex-[1_1_240px] rounded-[10px] border border-line px-3 text-sm"
          />
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Estado" className="h-10 rounded-[10px] border border-line bg-white px-3 text-sm">
            <option value="ACTIVE">Activas</option>
            <option value="INACTIVE">Inactivas</option>
            <option value="ALL">Todas</option>
          </select>
        </div>
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted">Cargando…</div>
        ) : items.length === 0 ? (
          <EmptyState title={term ? 'Sin resultados' : 'Todavía no hay mascotas'}>
            {term ? `No encontramos mascotas que coincidan con “${term}”.` : 'Registrá la primera mascota con su propietario para empezar a cargar evaluaciones y programas.'}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line-soft">
            {items.map((p) => (
              <li key={p.id}>
                <Link href={`/mascotas/${p.id}`} className="flex flex-wrap items-center gap-4 px-4 py-3 hover:bg-ground">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                    <PawIcon size={20} />
                  </span>
                  <span className="flex min-w-[200px] flex-1 flex-col">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">
                      {p.name}
                      {p.status === 'INACTIVE' && <Badge>Inactiva</Badge>}
                      {p.isDemo && <Badge tone="blue">Demo</Badge>}
                    </span>
                    <span className="text-xs text-muted">
                      {[p.breed ?? p.species, age(p.birthDate), p.owners].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <PetAlerts alerts={p.alerts} small />
                  {p.activeProgram ? <Badge tone="green">{p.activeProgram}</Badge> : <span className="text-xs text-faint">Sin programa activo</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[13px] text-muted">
            <span>
              {items.length} de {total}
            </span>
            {hasMore && (
              <Button variant="secondary" className="h-9 text-[13px]" onClick={() => setSize(size + 1)}>
                Cargar más
              </Button>
            )}
          </div>
        )}
      </Card>
      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva mascota">
        {creating && <NewPetForm onCancel={() => setCreating(false)} onDone={(id) => router.push(`/mascotas/${id}`)} />}
      </Modal>
    </>
  );
}

export default function MascotasPage() {
  return (
    <Suspense>
      <MascotasInner />
    </Suspense>
  );
}
