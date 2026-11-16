'use client';

import { MODALITY_LABELS } from '@adiestra/shared';
import { AlertTriangle, ChevronLeft, ChevronRight, MessageCircle, Plus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Alert, Button, cx, Modal, PageHeader, Select, TextInput } from '@/components/ui';
import { PetAlerts, SearchSelect, SessionBadge } from '@/components/widgets';
import { api, ApiError, fetcher } from '@/lib/api';
import { fmtDay, fmtTime, isoToLocalInput, localInputToIso, waLink } from '@/lib/format';
import { useMe } from '@/lib/me';
import type { AgendaSession, PetListItem, ProgramListItem, Trainer } from '@/lib/types';

const START_H = 7;
const END_H = 21;
const PX = 52;
const DAY = 86_400_000;
const TRAINER_COLORS = [
  ['#e8f1ec', '#2f6b4f'],
  ['#eaf0fd', '#1d4ed8'],
  ['#fef3e2', '#b45309'],
  ['#f3e8ff', '#7c3aed'],
  ['#fce7f3', '#be185d'],
  ['#e0f2f1', '#0f766e'],
];

/** Lunes 00:00 (Asunción) de la semana que contiene la fecha. */
function mondayOf(d: Date) {
  const local = new Date(d.getTime() - 3 * 3600_000);
  const wd = (local.getUTCDay() + 6) % 7;
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - wd));
  return new Date(day.getTime() + 3 * 3600_000);
}
/** Minutos desde las 00:00 en Asunción. */
const minuteOf = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

interface ConflictDetails {
  suggestions?: string[];
}

function NewSessionForm({ start, presetPet, presetProgram, trainers, onDone }: { start: string; presetPet?: string; presetProgram?: string; trainers: Trainer[]; onDone: () => void }) {
  const [petId, setPetId] = useState<string | null>(presetPet ?? null);
  const { data: presetPetData } = useSWR<{ name: string }>(presetPet ? `/pets/${presetPet}` : null, fetcher);
  const { data: programs } = useSWR<ProgramListItem[]>(petId ? `/programs?petId=${petId}&status=ACTIVE` : null, fetcher);
  const [programId, setProgramId] = useState(presetProgram ?? '');
  const program = programs?.find((p) => p.id === (programId || programs?.[0]?.id));
  const [f, setF] = useState({ startsAt: start, trainerId: '', duration: '60', modality: '', location: '', repeat: '1' });
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const trainerId = f.trainerId || program?.trainer?.id || trainers[0]?.id || '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api('/sessions', {
        method: 'POST',
        body: {
          petId,
          programId: program?.id ?? null,
          trainerId,
          startsAt: localInputToIso(f.startsAt),
          durationMinutes: Number(f.duration),
          modality: f.modality || (program?.service.modality ?? 'CENTER'),
          location: f.location || null,
          repeatWeeks: Number(f.repeat),
        },
      });
      onDone();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setSaving(false);
    }
  }
  const suggestions = (error?.details as ConflictDetails | undefined)?.suggestions ?? [];
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && (
        <Alert tone="red">
          {error.message}
          {suggestions.length > 0 && (
            <span className="mt-2 flex flex-wrap items-center gap-2">
              <span>Libres ese día:</span>
              {suggestions.map((s) => (
                <button key={s} type="button" className="rounded-full border border-brand bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-dark" onClick={() => setF({ ...f, startsAt: isoToLocalInput(s) })}>
                  {fmtTime(s)}
                </button>
              ))}
            </span>
          )}
        </Alert>
      )}
      {presetPet ? (
        <p className="text-sm">
          Mascota: <strong>{presetPetData?.name ?? '…'}</strong>
        </p>
      ) : (
        <SearchSelect<PetListItem>
          label="Mascota"
          endpoint={(q) => `/pets?limit=8${q ? `&search=${encodeURIComponent(q)}` : ''}`}
          value={petId}
          onChange={(p) => {
            setPetId(p?.id ?? null);
            setProgramId('');
          }}
          render={(p) => `${p.name}${p.owners ? ` · ${p.owners}` : ''}`}
        />
      )}
      {programs && (
        <Select
          label="Programa"
          value={program?.id ?? ''}
          onChange={(e) => setProgramId(e.target.value)}
          options={[...programs.map((p) => ({ value: p.id, label: `${p.service.name} · quedan ${p.balance}` })), { value: '', label: 'Sin programa (evaluación o suelta)' }]}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Fecha y hora" type="datetime-local" step={900} value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />
        <Select label="Duración" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} options={[30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} min` }))} />
        <Select label="Entrenador" value={trainerId} onChange={(e) => setF({ ...f, trainerId: e.target.value })} options={trainers.map((t) => ({ value: t.id, label: t.name }))} />
        <Select
          label="Modalidad"
          value={f.modality || program?.service.modality || 'CENTER'}
          onChange={(e) => setF({ ...f, modality: e.target.value })}
          options={Object.entries(MODALITY_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <TextInput label="Ubicación (opcional)" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Dirección si es a domicilio" />
        <Select label="Repetir" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} options={[1, 2, 4, 6, 8, 10, 12].map((v) => ({ value: String(v), label: v === 1 ? 'Solo esta vez' : `Todas las semanas, ${v} veces` }))} />
      </div>
      <Button type="submit" loading={saving} disabled={!petId} className="self-end">
        Agendar
      </Button>
    </form>
  );
}

function SessionPanel({ s, onChanged }: { s: AgendaSession; onChanged: () => void }) {
  const { can, me } = useMe();
  const [mode, setMode] = useState<null | 'reschedule' | 'cancel'>(null);
  const [when, setWhen] = useState(isoToLocalInput(s.startsAt));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const ro = me.organization?.readOnly;
  const open = s.status === 'SCHEDULED' || s.status === 'CONFIRMED';
  const started = new Date(s.startsAt).getTime() <= Date.now() + 2 * 3600_000;

  async function run(path: string, body?: unknown, method = 'POST') {
    setError(null);
    try {
      const r = await api<{ late?: boolean }>(path, { method, body });
      if (r?.late) setWarn('Cambio con menos anticipación que la política del centro: quedó registrado como tardío.');
      else onChanged();
      if (r?.late) setTimeout(onChanged, 1800);
    } catch (err) {
      setError(err as ApiError);
    }
  }
  const suggestions = (error?.details as ConflictDetails | undefined)?.suggestions ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/mascotas/${s.pet.id}`} className="text-lg font-bold text-brand">
            {s.pet.name}
          </Link>
          <SessionBadge status={s.status} />
        </div>
        <span className="text-sm text-muted">
          {fmtDay(s.startsAt)} · {fmtTime(s.startsAt)} a {fmtTime(s.endsAt)}
        </span>
        <span className="text-sm">
          {[s.service, s.sessionNumber && s.sessionsContracted ? `Sesión ${s.sessionNumber} de ${s.sessionsContracted}` : null, s.trainer?.name, MODALITY_LABELS[s.modality]].filter(Boolean).join(' · ')}
        </span>
        {s.location && <span className="text-sm text-muted">{s.location}</span>}
        <PetAlerts alerts={s.pet.alerts} />
        {s.owner && (
          <span className="flex items-center gap-2 text-sm">
            {s.owner}
            {s.ownerPhone && (
              <a href={waLink(s.ownerPhone)} target="_blank" rel="noopener noreferrer" className="text-brand" aria-label="WhatsApp del propietario">
                <MessageCircle size={16} aria-hidden />
              </a>
            )}
          </span>
        )}
      </div>
      {warn && <Alert tone="amber">{warn}</Alert>}
      {error && (
        <Alert tone="red">
          {error.message}
          {suggestions.length > 0 && (
            <span className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((x) => (
                <button key={x} type="button" className="rounded-full border border-brand bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-dark" onClick={() => setWhen(isoToLocalInput(x))}>
                  {fmtTime(x)}
                </button>
              ))}
            </span>
          )}
        </Alert>
      )}
      {(s.status === 'DONE' || s.status === 'NO_SHOW') && (
        <Link href={`/sesiones/${s.id}`} className="inline-flex h-11 items-center justify-center rounded-[10px] border border-line text-sm font-semibold">
          Ver registro
        </Link>
      )}
      {open && !ro && mode === null && (
        <div className="grid grid-cols-2 gap-2">
          {can('sessions:create') && started && (
            <Link href={`/sesiones/${s.id}`} className="col-span-2 inline-flex h-11 items-center justify-center rounded-[10px] bg-brand text-sm font-semibold text-white">
              Registrar sesión
            </Link>
          )}
          {can('agenda:update') && s.status === 'SCHEDULED' && (
            <Button variant="secondary" onClick={() => run(`/sessions/${s.id}/confirm`)}>
              Confirmar
            </Button>
          )}
          {can('agenda:update') && (
            <>
              <Button variant="secondary" onClick={() => setMode('reschedule')}>
                Reprogramar
              </Button>
              <Button variant="danger" onClick={() => setMode('cancel')}>
                Cancelar
              </Button>
            </>
          )}
        </div>
      )}
      {mode === 'reschedule' && (
        <div className="flex flex-col gap-3">
          <TextInput label="Nueva fecha y hora" type="datetime-local" step={900} value={when} onChange={(e) => setWhen(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMode(null)}>
              Volver
            </Button>
            <Button onClick={() => run(`/sessions/${s.id}/reschedule`, { startsAt: localInputToIso(when) }, 'PATCH')}>Guardar</Button>
          </div>
        </div>
      )}
      {mode === 'cancel' && (
        <div className="flex flex-col gap-3">
          <TextInput label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: el propietario avisó que viaja" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMode(null)}>
              Volver
            </Button>
            <Button variant="danger" disabled={!reason.trim()} onClick={() => run(`/sessions/${s.id}/cancel`, { reason })}>
              Cancelar sesión
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AgendaInner() {
  const { can, me } = useMe();
  const params = useSearchParams();
  const ro = me.organization?.readOnly;
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [trainerFilter, setTrainerFilter] = useState('');
  const [view, setView] = useState<'week' | 'day'>(() => (typeof window !== 'undefined' && window.innerWidth < 760 ? 'day' : 'week'));
  const [dayIndex, setDayIndex] = useState(() => (new Date(Date.now() - 3 * 3600_000).getUTCDay() + 6) % 7);
  const [selected, setSelected] = useState<AgendaSession | null>(null);
  const [creating, setCreating] = useState<string | null>(params.get('nueva') ? isoToLocalInput(new Date(Math.ceil(Date.now() / 1800_000) * 1800_000).toISOString()) : null);

  const from = weekStart.toISOString();
  const to = new Date(weekStart.getTime() + 7 * DAY).toISOString();
  const { data, mutate } = useSWR<{ sessions: AgendaSession[] }>(`/agenda?from=${from}&to=${to}${trainerFilter ? `&trainerId=${trainerFilter}` : ''}`, fetcher);
  const { data: trainers } = useSWR<Trainer[]>('/trainers', fetcher);
  const colorOf = useMemo(() => {
    const map = new Map((trainers ?? []).map((t, i) => [t.id, TRAINER_COLORS[i % TRAINER_COLORS.length]]));
    return (id?: string) => map.get(id ?? '') ?? TRAINER_COLORS[0];
  }, [trainers]);

  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY));
  const shownDays = view === 'week' ? days.map((d, i) => [d, i] as const) : [[days[dayIndex], dayIndex] as const];
  const todayIdx = days.findIndex((d) => d.getTime() <= Date.now() && Date.now() < d.getTime() + DAY);

  const byDay = useMemo(() => {
    const out: (AgendaSession & { lane: number; lanes: number })[][] = Array.from({ length: 7 }, () => []);
    for (const s of data?.sessions ?? []) {
      const i = Math.floor((new Date(s.startsAt).getTime() - weekStart.getTime()) / DAY);
      if (i >= 0 && i < 7) out[i].push({ ...s, lane: 0, lanes: 1 });
    }
    for (const list of out) {
      list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      const ends: number[] = [];
      for (const s of list) {
        const st = new Date(s.startsAt).getTime();
        let lane = ends.findIndex((e) => e <= st);
        if (lane === -1) lane = ends.length;
        ends[lane] = new Date(s.endsAt).getTime();
        s.lane = lane;
      }
      for (const s of list) s.lanes = Math.max(1, ...list.filter((o) => o.startsAt < s.endsAt && o.endsAt > s.startsAt).map((o) => o.lane + 1));
    }
    return out;
  }, [data, weekStart]);

  const label = `${days[0].toLocaleDateString('es-PY', { day: 'numeric', month: 'short', timeZone: 'America/Asuncion' })} al ${days[6].toLocaleDateString('es-PY', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Asuncion' })}`;
  const move = (n: number) => {
    if (view === 'day') {
      const ni = dayIndex + n;
      if (ni < 0 || ni > 6) setWeekStart(new Date(weekStart.getTime() + Math.sign(n) * 7 * DAY));
      setDayIndex((ni + 7) % 7);
    } else setWeekStart(new Date(weekStart.getTime() + n * 7 * DAY));
  };

  return (
    <>
      <PageHeader
        title="Agenda"
        actions={
          can('agenda:create') && !ro ? (
            <Button onClick={() => setCreating(isoToLocalInput(new Date(Math.ceil(Date.now() / 1800_000) * 1800_000).toISOString()))}>
              <Plus size={16} aria-hidden /> Nueva sesión
            </Button>
          ) : null
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          className="h-10"
          onClick={() => {
            setWeekStart(mondayOf(new Date()));
            setDayIndex((new Date(Date.now() - 3 * 3600_000).getUTCDay() + 6) % 7);
          }}
        >
          Hoy
        </Button>
        <button onClick={() => move(-1)} aria-label="Anterior" className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-line bg-white">
          <ChevronLeft size={16} aria-hidden />
        </button>
        <button onClick={() => move(1)} aria-label="Siguiente" className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-line bg-white">
          <ChevronRight size={16} aria-hidden />
        </button>
        <span className="font-semibold">{view === 'day' ? fmtDay(days[dayIndex]) : label}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <div role="group" aria-label="Vista" className="flex rounded-[10px] bg-[#eceae6] p-[3px]">
            {(
              [
                ['day', 'Día'],
                ['week', 'Semana'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={cx('h-[34px] rounded-lg px-3.5 text-sm', view === v ? 'bg-white font-semibold' : '')}>
                {l}
              </button>
            ))}
          </div>
          {!me.role?.scopeOwn && (
            <select aria-label="Entrenador" value={trainerFilter} onChange={(e) => setTrainerFilter(e.target.value)} className="h-10 rounded-[10px] border border-line bg-white px-3 text-sm">
              <option value="">Todos los entrenadores</option>
              {trainers?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {trainers && trainers.length > 1 && (
        <div className="flex flex-wrap gap-3 text-xs">
          {trainers.map((t) => (
            <span key={t.id} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(t.id)[1] }} />
              {t.name}
            </span>
          ))}
        </div>
      )}

      <section aria-label="Calendario" className="overflow-x-auto rounded-[14px] border border-line bg-white">
        <div style={{ minWidth: view === 'week' ? 820 : 320 }}>
          <div className="grid border-b border-line" style={{ gridTemplateColumns: `52px repeat(${shownDays.length}, minmax(0, 1fr))` }}>
            <span />
            {shownDays.map(([d, i]) => (
              <div key={i} className="flex flex-col items-center gap-0.5 border-l border-line-soft py-2">
                <span className="text-xs text-muted">{d.toLocaleDateString('es-PY', { weekday: 'short', timeZone: 'America/Asuncion' })}</span>
                <span className={cx('flex h-7 min-w-7 items-center justify-center rounded-full text-sm font-semibold', i === todayIdx && 'bg-brand px-2 text-white')}>
                  {d.toLocaleDateString('es-PY', { day: 'numeric', timeZone: 'America/Asuncion' })}
                </span>
              </div>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: `52px repeat(${shownDays.length}, minmax(0, 1fr))` }}>
            <div className="relative" style={{ height: (END_H - START_H) * PX }}>
              {Array.from({ length: END_H - START_H }, (_, h) => (
                <span key={h} className="absolute right-2 text-[11px] text-faint" style={{ top: h * PX + 2 }}>
                  {String(START_H + h).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {shownDays.map(([d, i]) => (
              <div
                key={i}
                className="relative border-l border-line-soft"
                style={{
                  height: (END_H - START_H) * PX,
                  backgroundImage: `repeating-linear-gradient(to bottom, #f0eeea 0, #f0eeea 1px, transparent 1px, transparent ${PX}px)`,
                }}
                onClick={(e) => {
                  if (!can('agenda:create') || ro || e.target !== e.currentTarget) return;
                  const y = e.nativeEvent.offsetY;
                  const minutes = START_H * 60 + Math.floor(y / (PX / 2)) * 30;
                  setCreating(isoToLocalInput(new Date(d.getTime() + minutes * 60000).toISOString()));
                }}
              >
                {byDay[i].map((s) => {
                  const [bg, fg] = colorOf(s.trainer?.id);
                  const top = ((minuteOf(s.startsAt) - START_H * 60) / 60) * PX;
                  const h = Math.max(22, ((new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 3600_000) * PX - 3);
                  const w = 100 / s.lanes;
                  const cancelled = s.status === 'CANCELLED';
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelected(s)}
                      className="absolute flex flex-col overflow-hidden rounded-lg px-1.5 py-1 text-left"
                      style={{
                        top: top + 1,
                        height: h,
                        left: `calc(${s.lane * w}% + 2px)`,
                        width: `calc(${w}% - 4px)`,
                        background: cancelled ? '#f5f4f1' : bg,
                        border: `1px ${s.modality === 'GROUP' ? 'dashed' : 'solid'} ${cancelled ? '#d6d3ce' : fg}`,
                        opacity: s.status === 'DONE' || s.status === 'NO_SHOW' ? 0.75 : 1,
                      }}
                    >
                      <span className={cx('truncate text-xs font-semibold', cancelled && 'text-faint line-through')}>
                        {s.pet.alerts.length > 0 && !cancelled && <AlertTriangle size={11} className="mr-0.5 inline text-danger" aria-label="Tiene avisos" />}
                        {s.pet.name}
                      </span>
                      <span className="truncate text-[11px] text-[#44403c]">
                        {fmtTime(s.startsAt)} {s.status === 'DONE' ? '· realizada' : s.status === 'NO_SHOW' ? '· ausente' : s.status === 'CONFIRMED' ? '· confirmada' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>
      <p className="text-xs text-muted">Tocá un espacio libre para agendar en ese horario. Borde punteado: clase grupal. Tachado: cancelada.</p>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Sesión">
        {selected && (
          <SessionPanel
            s={selected}
            onChanged={() => {
              setSelected(null);
              mutate();
            }}
          />
        )}
      </Modal>
      <Modal open={!!creating} onClose={() => setCreating(null)} title="Nueva sesión">
        {creating && trainers && (
          <NewSessionForm
            start={creating}
            presetPet={params.get('petId') ?? undefined}
            presetProgram={params.get('programId') ?? undefined}
            trainers={trainers}
            onDone={() => {
              setCreating(null);
              mutate();
            }}
          />
        )}
      </Modal>
    </>
  );
}

export default function AgendaPage() {
  return (
    <Suspense>
      <AgendaInner />
    </Suspense>
  );
}
