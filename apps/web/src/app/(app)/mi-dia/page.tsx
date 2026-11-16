'use client';

import { MODALITY_LABELS } from '@adiestra/shared';
import { MapPin, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { PetAlerts, SessionBadge } from '@/components/widgets';
import { fetcher } from '@/lib/api';
import { fmtDay, fmtTime, waLink } from '@/lib/format';
import type { AgendaSession } from '@/lib/types';

export default function MiDiaPage() {
  const { data } = useSWR<AgendaSession[]>('/my-day', fetcher, { refreshInterval: 60_000 });
  const done = data?.filter((s) => s.status === 'DONE' || s.status === 'NO_SHOW').length ?? 0;
  const now = Date.now();
  const current = data?.find((s) => (s.status === 'SCHEDULED' || s.status === 'CONFIRMED') && new Date(s.endsAt).getTime() > now);
  return (
    <>
      <PageHeader title="Mi día" subtitle={fmtDay(new Date())} />
      {data && data.length > 0 && (
        <Card className="flex flex-col gap-2 p-4">
          <div className="flex justify-between text-sm">
            <span>Sesiones registradas</span>
            <span className="font-semibold">
              {done} de {data.length}
            </span>
          </div>
          <div className="h-2 rounded bg-line-soft">
            <div className="h-2 rounded bg-brand" style={{ width: `${(done / data.length) * 100}%` }} />
          </div>
        </Card>
      )}
      {!data ? (
        <div className="p-10 text-center text-sm text-muted">Cargando…</div>
      ) : data.length === 0 ? (
        <Card>
          <EmptyState title="No tenés sesiones hoy">Las sesiones que te asignen en la agenda aparecen acá.</EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((s) => {
            const isCurrent = current?.id === s.id;
            const recorded = s.status === 'DONE' || s.status === 'NO_SHOW';
            const canRecord = !recorded && new Date(s.startsAt).getTime() <= now + 2 * 3600_000;
            return (
              <Card key={s.id} className={`flex flex-col gap-3 p-4 ${isCurrent ? 'border-2 border-brand' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-bold">
                    {fmtTime(s.startsAt)}
                    {isCurrent && new Date(s.startsAt).getTime() <= now ? ' · Ahora' : ''}
                  </span>
                  <SessionBadge status={s.status} />
                </div>
                <div className="flex flex-col">
                  <Link href={`/mascotas/${s.pet.id}`} className="text-base font-semibold">
                    {s.pet.name}
                    {s.pet.breed ? ` · ${s.pet.breed}` : ''}
                  </Link>
                  <span className="text-[13px] text-muted">
                    {[s.service, s.sessionNumber && s.sessionsContracted ? `Sesión ${s.sessionNumber} de ${s.sessionsContracted}` : null, MODALITY_LABELS[s.modality]].filter(Boolean).join(' · ')}
                  </span>
                </div>
                {s.location && (
                  <span className="flex items-start gap-2 text-[13px] text-[#44403c]">
                    <MapPin size={15} className="mt-0.5 shrink-0" aria-hidden /> {s.location}
                  </span>
                )}
                <PetAlerts alerts={s.pet.alerts} small />
                <div className="grid grid-cols-2 gap-2">
                  {s.ownerPhone ? (
                    <a href={waLink(s.ownerPhone)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-line text-sm font-medium">
                      <MessageCircle size={16} aria-hidden /> {s.owner?.split(' ')[0] ?? 'WhatsApp'}
                    </a>
                  ) : (
                    <span />
                  )}
                  <Link
                    href={`/sesiones/${s.id}`}
                    className={`inline-flex h-11 items-center justify-center rounded-[10px] text-sm font-semibold ${canRecord ? 'bg-brand text-white' : 'border border-line'}`}
                  >
                    {recorded ? 'Ver registro' : canRecord ? 'Registrar sesión' : 'Ver detalle'}
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
