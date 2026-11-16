'use client';

import { Plus, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import useSWR from 'swr';
import { Alert, Badge, Button, Card, Select, TextInput } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';
import { fmtDateTime, localInputToIso } from '@/lib/format';
import type { Skill, Trainer } from '@/lib/types';

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + (m || 0);
};

export function PoliciesCard({ noShowConsumes, cancelHours, editable, onSaved }: { noShowConsumes: boolean; cancelHours: number; editable: boolean; onSaved: () => void }) {
  const [ns, setNs] = useState(noShowConsumes);
  const [ch, setCh] = useState(String(cancelHours));
  const [msg, setMsg] = useState<string | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    await api('/organization/policies', { method: 'PATCH', body: { noShowConsumes: ns, cancelHours: Number(ch) } });
    setMsg('Políticas guardadas.');
    onSaved();
  }
  return (
    <Card className="p-5">
      <form onSubmit={save} className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Políticas de sesiones</h2>
        {msg && <Alert tone="green">{msg}</Alert>}
        <fieldset disabled={!editable} className="flex flex-col gap-4">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={ns} onChange={(e) => setNs(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand" />
            <span>
              <strong>Una ausencia sin aviso descuenta la sesión del paquete.</strong>
              <span className="block text-xs text-muted">Si está desmarcado, la ausencia queda registrada pero no consume sesión.</span>
            </span>
          </label>
          <TextInput label="Horas mínimas para cancelar o reprogramar sin que cuente como tardío" type="number" min={0} max={168} value={ch} onChange={(e) => setCh(e.target.value)} />
        </fieldset>
        {editable && (
          <Button type="submit" className="self-start">
            Guardar políticas
          </Button>
        )}
      </form>
    </Card>
  );
}

interface Hours {
  hours: { id: string; userId: string; weekday: number; startMinute: number; endMinute: number }[];
  timeOff: { id: string; userId: string; startsAt: string; endsAt: string; reason: string | null }[];
}

export function WorkingHoursCard({ editable }: { editable: boolean }) {
  const { data: trainers } = useSWR<Trainer[]>('/trainers', fetcher);
  const { data, mutate } = useSWR<Hours>('/working-hours', fetcher);
  const [userId, setUserId] = useState('');
  const [blocks, setBlocks] = useState<{ weekday: number; start: string; end: string }[]>([]);
  const [off, setOff] = useState({ start: '', end: '', reason: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const current = userId || trainers?.[0]?.id || '';

  useEffect(() => {
    if (!data || !current) return;
    setBlocks(data.hours.filter((h) => h.userId === current).map((h) => ({ weekday: h.weekday, start: toHHMM(h.startMinute), end: toHHMM(h.endMinute) })));
  }, [data, current]);

  async function save() {
    setError(null);
    try {
      await api('/working-hours', { method: 'PUT', body: { userId: current, blocks: blocks.map((b) => ({ weekday: b.weekday, startMinute: toMin(b.start), endMinute: toMin(b.end) })) } });
      setMsg('Horario guardado. La agenda no deja agendar fuera de él.');
      mutate();
    } catch (err) {
      setError(err as ApiError);
    }
  }
  async function addOff(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/time-off', { method: 'POST', body: { userId: current, startsAt: localInputToIso(off.start), endsAt: localInputToIso(off.end), reason: off.reason || null } });
      setOff({ start: '', end: '', reason: '' });
      mutate();
    } catch (err) {
      setError(err as ApiError);
    }
  }
  if (!trainers) return null;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="text-base font-semibold">Horarios de entrenadores</h2>
      <p className="-mt-2 text-sm text-muted">Si un entrenador no tiene horario cargado, se le puede agendar en cualquier momento.</p>
      {error && <Alert tone="red">{error.message}</Alert>}
      {msg && <Alert tone="green">{msg}</Alert>}
      <Select label="Entrenador" value={current} onChange={(e) => setUserId(e.target.value)} options={trainers.map((t) => ({ value: t.id, label: t.name }))} />
      <div className="flex flex-col gap-2">
        {blocks.map((b, i) => (
          <div key={i} className="grid items-end gap-2 [grid-template-columns:1fr_110px_110px_40px]">
            <Select label="Día" value={String(b.weekday)} disabled={!editable} onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, weekday: Number(e.target.value) } : x)))} options={WEEKDAYS.map((d, k) => ({ value: String(k), label: d }))} />
            <TextInput label="Desde" type="time" disabled={!editable} value={b.start} onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
            <TextInput label="Hasta" type="time" disabled={!editable} value={b.end} onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
            {editable && (
              <button type="button" aria-label="Quitar bloque" onClick={() => setBlocks(blocks.filter((_, j) => j !== i))} className="flex h-11 items-center justify-center rounded-lg text-muted hover:bg-line-soft">
                <Trash2 size={16} aria-hidden />
              </button>
            )}
          </div>
        ))}
        {blocks.length === 0 && <p className="text-sm text-muted">Sin horario cargado.</p>}
      </div>
      {editable && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="h-9 text-[13px]" onClick={() => setBlocks([...blocks, { weekday: 1, start: '08:00', end: '12:00' }])}>
            <Plus size={14} aria-hidden /> Agregar bloque
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-9 text-[13px]"
            onClick={() => setBlocks([1, 2, 3, 4, 5].flatMap((d) => [{ weekday: d, start: '08:00', end: '12:00' }, { weekday: d, start: '14:00', end: '18:00' }]))}
          >
            Lunes a viernes 8–12 y 14–18
          </Button>
          <Button type="button" className="h-9 text-[13px]" onClick={save}>
            Guardar horario
          </Button>
        </div>
      )}
      <h3 className="mt-2 text-sm font-semibold">Ausencias y días no disponibles</h3>
      {data?.timeOff
        .filter((t) => t.userId === current)
        .map((t) => (
          <div key={t.id} className="flex items-center justify-between border-t border-line-soft pt-2 text-sm">
            <span>
              {fmtDateTime(t.startsAt)} a {fmtDateTime(t.endsAt)} {t.reason && <Badge>{t.reason}</Badge>}
            </span>
            {editable && (
              <button
                aria-label="Quitar ausencia"
                onClick={async () => {
                  await api(`/time-off/${t.id}`, { method: 'DELETE' });
                  mutate();
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-line-soft"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            )}
          </div>
        ))}
      {editable && (
        <form onSubmit={addOff} className="grid items-end gap-2 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
          <TextInput label="Desde" type="datetime-local" value={off.start} onChange={(e) => setOff({ ...off, start: e.target.value })} />
          <TextInput label="Hasta" type="datetime-local" value={off.end} onChange={(e) => setOff({ ...off, end: e.target.value })} />
          <TextInput label="Motivo" value={off.reason} onChange={(e) => setOff({ ...off, reason: e.target.value })} placeholder="Vacaciones" />
          <Button type="submit" variant="secondary" disabled={!off.start || !off.end}>
            Agregar ausencia
          </Button>
        </form>
      )}
    </Card>
  );
}

export function SkillsCard({ editable }: { editable: boolean }) {
  const { data, mutate } = useSWR<Skill[]>('/skills', fetcher);
  const [name, setName] = useState('');
  async function add(e: FormEvent) {
    e.preventDefault();
    await api('/skills', { method: 'POST', body: { name } });
    setName('');
    mutate();
  }
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="text-base font-semibold">Habilidades que se califican</h2>
      <p className="-mt-1 text-sm text-muted">Escala de 1 a 5: no lo hace, lo intenta, con ayuda, sin ayuda, con distracciones.</p>
      <ul className="flex flex-wrap gap-2">
        {data?.map((s) => (
          <li key={s.id}>
            <button
              disabled={!editable}
              onClick={async () => {
                await api(`/skills/${s.id}`, { method: 'PATCH', body: { active: !s.active } });
                mutate();
              }}
              title={editable ? (s.active ? 'Tocá para desactivar' : 'Tocá para activar') : undefined}
              className={`rounded-full px-3 py-1.5 text-[13px] ${s.active ? 'border border-brand bg-brand-soft text-brand-dark' : 'border border-line text-faint line-through'}`}
            >
              {s.name}
            </button>
          </li>
        ))}
      </ul>
      {editable && (
        <form onSubmit={add} className="flex gap-2">
          <label htmlFor="nueva-hab" className="sr-only">
            Nueva habilidad
          </label>
          <input id="nueva-hab" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva habilidad, ej.: Subir al auto" className="h-10 flex-1 rounded-[10px] border border-line px-3 text-sm" />
          <Button type="submit" variant="secondary" className="h-10" disabled={!name.trim()}>
            Agregar
          </Button>
        </form>
      )}
    </Card>
  );
}
