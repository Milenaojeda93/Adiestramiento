'use client';

import { formatMoney, PROGRAM_STATUS_LABELS } from '@adiestra/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import useSWR from 'swr';
import { Alert, Button, Card, Modal, Select, TextInput } from '@/components/ui';
import { KeyValue, PackageBar, ProgramBadge, SessionBadge } from '@/components/widgets';
import { api, ApiError, fetcher } from '@/lib/api';
import { fmtDateTime, fmtIsoDate } from '@/lib/format';
import { useMe } from '@/lib/me';
import type { AgendaSession, Trainer } from '@/lib/types';

interface Program {
  id: string;
  status: keyof typeof PROGRAM_STATUS_LABELS;
  petId: string;
  clientId: string;
  trainerId: string;
  startDate: string;
  endDate: string | null;
  expiresAt: string | null;
  goals: string | null;
  notes: string | null;
  sessionsContracted: number;
  price: number;
  service: string;
  petName: string;
  clientName: string;
  trainerName: string | null;
  balance: number;
  done: number;
  ledger: { id: string; kind: string; delta: number; note: string | null; createdAt: string }[];
}

const KIND = { PURCHASE: 'Contratación', CONSUME: 'Sesión descontada', REVERSE: 'Devolución', ADJUST: 'Ajuste manual', EXPIRE: 'Vencimiento' } as const;

export default function ProgramaPage() {
  const { id } = useParams<{ id: string }>();
  const { can, me } = useMe();
  const ro = me.organization?.readOnly;
  const { data: p, mutate } = useSWR<Program>(`/programs/${id}`, fetcher);
  const { data: sessions } = useSWR<AgendaSession[]>(`/sessions?programId=${id}`, fetcher);
  const { data: trainers } = useSWR<Trainer[]>(can('programs:create') ? '/trainers' : null, fetcher);
  const [adjusting, setAdjusting] = useState(false);
  const [delta, setDelta] = useState('1');
  const [note, setNote] = useState('');
  const [error, setError] = useState<ApiError | null>(null);

  if (!p) return <div className="p-10 text-center text-sm text-muted">Cargando…</div>;
  const editable = can('programs:create') && !ro;

  async function patch(body: Record<string, unknown>) {
    setError(null);
    try {
      await api(`/programs/${id}`, { method: 'PATCH', body });
      mutate();
    } catch (err) {
      setError(err as ApiError);
    }
  }
  async function adjust(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/programs/${id}/adjust`, { method: 'POST', body: { delta: Number(delta), note } });
      setAdjusting(false);
      setNote('');
      mutate();
    } catch (err) {
      setError(err as ApiError);
    }
  }

  return (
    <>
      <nav aria-label="Ruta" className="flex gap-1.5 text-[13px] text-muted">
        <Link href="/programas" className="text-brand">
          Programas
        </Link>
        <span>/</span>
        <span>
          {p.petName} · {p.service}
        </span>
      </nav>
      {error && <Alert tone="red">{error.message}</Alert>}
      <Card className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
            {p.service} <ProgramBadge status={p.status} />
          </h1>
          <span className="text-sm text-muted">
            <Link href={`/mascotas/${p.petId}`} className="text-brand">
              {p.petName}
            </Link>{' '}
            ·{' '}
            <Link href={`/clientes/${p.clientId}`} className="text-brand">
              {p.clientName}
            </Link>{' '}
            · {formatMoney(p.price)}
          </span>
        </div>
        {editable && p.status === 'ACTIVE' && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/agenda?nueva=1&petId=${p.petId}&programId=${p.id}`} className="inline-flex h-11 items-center rounded-[10px] bg-brand px-4 text-sm font-semibold text-white">
              + Agendar sesión
            </Link>
            <Button variant="secondary" onClick={() => patch({ status: 'PAUSED' })}>
              Pausar
            </Button>
            <Button variant="secondary" onClick={() => patch({ status: 'FINISHED' })}>
              Finalizar
            </Button>
          </div>
        )}
        {editable && p.status === 'PAUSED' && <Button onClick={() => patch({ status: 'ACTIVE' })}>Reanudar</Button>}
      </Card>

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold">Paquete de sesiones</h2>
          <PackageBar done={p.done} total={p.sessionsContracted} balance={p.balance} />
          <ul className="flex flex-col text-sm">
            {p.ledger.map((l) => (
              <li key={l.id} className="flex justify-between gap-3 border-t border-line-soft py-2">
                <span className="flex flex-col">
                  <span>{KIND[l.kind as keyof typeof KIND]}</span>
                  <span className="text-xs text-muted">
                    {fmtDateTime(l.createdAt)}
                    {l.note ? ` · ${l.note}` : ''}
                  </span>
                </span>
                <span className={`font-semibold ${l.delta < 0 ? 'text-danger-ink' : 'text-brand'}`}>{l.delta > 0 ? `+${l.delta}` : l.delta}</span>
              </li>
            ))}
          </ul>
          {editable && (
            <Button variant="secondary" className="h-9 self-start text-[13px]" onClick={() => setAdjusting(true)}>
              Ajustar paquete
            </Button>
          )}
        </Card>
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold">Detalle</h2>
          <KeyValue
            items={[
              ['Inicio', fmtIsoDate(p.startDate)],
              ['Finalización', fmtIsoDate(p.endDate)],
              ['Vencimiento del paquete', fmtIsoDate(p.expiresAt)],
              ['Objetivos', p.goals],
            ]}
          />
          {editable && trainers ? (
            <Select label="Entrenador a cargo" value={p.trainerId} onChange={(e) => patch({ trainerId: e.target.value })} options={trainers.map((t) => ({ value: t.id, label: t.name }))} />
          ) : (
            <p className="text-sm">Entrenador: {p.trainerName}</p>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="px-5 pt-5 text-base font-semibold">Sesiones</h2>
        {sessions?.length === 0 && <p className="px-5 py-4 text-sm text-muted">Todavía no hay sesiones agendadas.</p>}
        <ul className="divide-y divide-line-soft">
          {sessions?.map((s) => (
            <li key={s.id}>
              <Link href={`/sesiones/${s.id}`} className="flex items-center justify-between gap-2 px-5 py-3 hover:bg-ground">
                <span className="text-sm">
                  {fmtDateTime(s.startsAt)} · {s.trainer?.name}
                </span>
                <SessionBadge status={s.status} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Modal open={adjusting} onClose={() => setAdjusting(false)} title="Ajustar paquete">
        <form onSubmit={adjust} className="flex flex-col gap-4">
          <TextInput label="Sesiones (+ suma, − resta)" type="number" min={-50} max={50} value={delta} onChange={(e) => setDelta(e.target.value)} />
          <TextInput label="Motivo" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: sesión de cortesía por reprogramación" />
          <p className="text-xs text-muted">Queda registrado en el historial del paquete y en la auditoría.</p>
          <Button type="submit" disabled={!note.trim()} className="self-end">
            Guardar ajuste
          </Button>
        </form>
      </Modal>
    </>
  );
}
