'use client';

import { PROGRAM_STATUS_LABELS } from '@adiestra/shared';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import useSWR from 'swr';
import { ProgramForm } from '@/components/forms';
import { Button, Card, EmptyState, Modal, PageHeader } from '@/components/ui';
import { PackageBar, ProgramBadge } from '@/components/widgets';
import { fetcher } from '@/lib/api';
import { fmtIsoDate } from '@/lib/format';
import { useMe } from '@/lib/me';
import type { ProgramListItem } from '@/lib/types';

function ProgramasInner() {
  const { can, me } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<string>('ACTIVE');
  const [creating, setCreating] = useState(!!params.get('nuevo'));
  const { data } = useSWR<ProgramListItem[]>(`/programs?status=${status}`, fetcher);
  const ro = me.organization?.readOnly;
  return (
    <>
      <PageHeader
        title="Programas"
        actions={
          can('programs:create') && !ro ? (
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden /> Nuevo programa
            </Button>
          ) : null
        }
      />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3.5">
          <label htmlFor="estado-prog" className="sr-only">
            Estado
          </label>
          <select id="estado-prog" value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-[10px] border border-line bg-white px-3 text-sm">
            {Object.entries(PROGRAM_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}s
              </option>
            ))}
            <option value="ALL">Todos</option>
          </select>
        </div>
        {!data ? (
          <div className="p-10 text-center text-sm text-muted">Cargando…</div>
        ) : data.length === 0 ? (
          <EmptyState title="No hay programas con ese estado" />
        ) : (
          <ul className="divide-y divide-line-soft">
            {data.map((p) => (
              <li key={p.id}>
                <Link href={`/programas/${p.id}`} className="grid gap-3 px-5 py-4 hover:bg-ground md:grid-cols-[1fr_200px_260px]">
                  <span className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">
                      {p.pet.name} · {p.service.name} <ProgramBadge status={p.status} />
                    </span>
                    <span className="text-xs text-muted">
                      {p.client.firstName} {p.client.lastName} · desde el {fmtIsoDate(p.startDate)}
                      {p.expiresAt ? ` · vence el ${fmtIsoDate(p.expiresAt)}` : ''}
                    </span>
                  </span>
                  <span className="text-sm text-[#44403c]">{p.trainer?.name}</span>
                  <PackageBar done={p.done} total={p.sessionsContracted} balance={p.balance} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo programa">
        {creating && <ProgramForm petId={params.get('petId') ?? undefined} onCancel={() => setCreating(false)} onDone={(id) => router.push(`/programas/${id}`)} />}
      </Modal>
    </>
  );
}

export default function ProgramasPage() {
  return (
    <Suspense>
      <ProgramasInner />
    </Suspense>
  );
}
