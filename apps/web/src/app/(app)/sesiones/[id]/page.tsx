'use client';

import { RATING_SCALE } from '@adiestra/shared';
import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import useSWR from 'swr';
import { Alert, Button, Card, cx, Select, TextArea, TextInput } from '@/components/ui';
import { KeyValue, PetAlerts, RatingPicker, SessionBadge } from '@/components/widgets';
import { api, ApiError, fetcher } from '@/lib/api';
import { fmtDay, fmtTime } from '@/lib/format';
import { useMe } from '@/lib/me';
import type { Skill } from '@/lib/types';

interface SessionFull {
  id: string;
  petId: string;
  petName: string;
  alerts: string[];
  programId: string | null;
  trainerName: string | null;
  service: string | null;
  startsAt: string;
  endsAt: string;
  status: 'SCHEDULED' | 'CONFIRMED' | 'DONE' | 'CANCELLED' | 'NO_SHOW';
  cancelReason: string | null;
  location: string | null;
  notes: string | null;
  objectives: string | null;
  exercises: string | null;
  commands: string[];
  results: string | null;
  difficulties: string | null;
  behavior: string | null;
  responseLevel: number | null;
  internalNotes: string | null;
  nextGoals: string | null;
  completedAt: string | null;
  balance: number | null;
  ratings: { skillId: string; skill: string; value: number }[];
  previousRatings: Record<string, number>;
  tasks: { id: string; title: string; detail: string | null; frequency: string | null }[];
}

const COMMON_COMMANDS = ['Sentado', 'Echado', 'Quieto', 'Ven', 'Junto', 'Mirame', 'Dejalo', 'Suelta', 'Giro en U', 'Alfombra', 'Busca'];

function RecordForm({ s, skills, onDone }: { s: SessionFull; skills: Skill[]; onDone: () => void }) {
  const [attendance, setAttendance] = useState<'DONE' | 'NO_SHOW'>('DONE');
  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const [commands, setCommands] = useState<string[]>([]);
  const [extraCmd, setExtraCmd] = useState('');
  const [f, setF] = useState({ objectives: '', exercises: '', results: '', difficulties: '', behavior: '', responseLevel: '', internalNotes: '', nextGoals: '' });
  const [tasks, setTasks] = useState<{ title: string; frequency: string }[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const toggleCmd = (c: string) => setCommands(commands.includes(c) ? commands.filter((x) => x !== c) : [...commands, c]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/sessions/${s.id}/record`, {
        method: 'POST',
        body: {
          attendance,
          ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v || null])),
          responseLevel: f.responseLevel ? Number(f.responseLevel) : null,
          commands,
          ratings: Object.entries(ratings)
            .filter(([, v]) => v)
            .map(([skillId, value]) => ({ skillId, value })),
          tasks: tasks.filter((t) => t.title.trim()).map((t) => ({ title: t.title, frequency: t.frequency || null })),
        },
      });
      onDone();
    } catch (err) {
      setError(err as ApiError);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && <Alert tone="red">{error.message}</Alert>}
      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold">Asistencia</h2>
        <div role="group" aria-label="Asistencia" className="grid grid-cols-2 gap-2">
          {(
            [
              ['DONE', 'Realizada'],
              ['NO_SHOW', 'Ausente sin aviso'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              aria-pressed={attendance === v}
              onClick={() => setAttendance(v)}
              className={cx('h-11 rounded-[10px] text-sm', attendance === v ? 'border border-brand bg-brand-soft font-semibold text-brand-dark' : 'border border-line bg-white')}
            >
              {l}
            </button>
          ))}
        </div>
      </Card>

      {attendance === 'DONE' && (
        <>
          <Card className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Habilidades</h2>
              <span className="text-xs text-muted">{RATING_SCALE.map((r) => `${r.value} ${r.label}`).join(' · ')}</span>
            </div>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
              {skills
                .filter((k) => k.active)
                .map((k) => (
                  <RatingPicker key={k.id} label={k.name} previous={s.previousRatings[k.id]} value={ratings[k.id] ?? null} onChange={(v) => setRatings({ ...ratings, [k.id]: v })} />
                ))}
            </div>
          </Card>
          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold">Comandos trabajados</h2>
            <div className="flex flex-wrap gap-2">
              {[...COMMON_COMMANDS, ...commands.filter((c) => !COMMON_COMMANDS.includes(c))].map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={commands.includes(c)}
                  onClick={() => toggleCmd(c)}
                  className={cx('min-h-10 rounded-full px-3 text-[13px]', commands.includes(c) ? 'border border-brand bg-brand-soft font-semibold text-brand-dark' : 'border border-line bg-white')}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <label htmlFor="otro-cmd" className="sr-only">
                Otro comando
              </label>
              <input id="otro-cmd" value={extraCmd} onChange={(e) => setExtraCmd(e.target.value)} placeholder="Otro comando" className="h-10 flex-1 rounded-[10px] border border-line px-3 text-sm" />
              <Button
                type="button"
                variant="secondary"
                className="h-10"
                onClick={() => {
                  if (extraCmd.trim()) setCommands([...commands, extraCmd.trim()]);
                  setExtraCmd('');
                }}
              >
                Agregar
              </Button>
            </div>
          </Card>
          <Card className="flex flex-col gap-4 p-4">
            <TextArea label="Objetivos de la sesión" value={f.objectives} onChange={set('objectives')} rows={2} />
            <TextArea label="Ejercicios realizados" value={f.exercises} onChange={set('exercises')} rows={2} />
            <TextArea label="Resultados obtenidos" value={f.results} onChange={set('results')} rows={3} />
            <TextArea label="Dificultades encontradas" value={f.difficulties} onChange={set('difficulties')} rows={2} />
            <TextArea label="Comportamiento observado" value={f.behavior} onChange={set('behavior')} rows={2} />
            <Select
              label="Nivel de respuesta"
              value={f.responseLevel}
              onChange={set('responseLevel')}
              options={[{ value: '', label: 'Sin indicar' }, ...[1, 2, 3, 4, 5].map((v) => ({ value: String(v), label: `${v} de 5` }))]}
            />
            <TextArea label="Próximos objetivos" value={f.nextGoals} onChange={set('nextGoals')} rows={2} />
            <TextArea label="Nota interna (no la ve el propietario)" value={f.internalNotes} onChange={set('internalNotes')} rows={2} />
          </Card>
          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold">Tareas para casa</h2>
            {tasks.map((t, i) => (
              <div key={i} className="grid items-end gap-2 [grid-template-columns:1fr_160px_40px]">
                <TextInput label="Ejercicio" value={t.title} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <TextInput label="Frecuencia" value={t.frequency} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, frequency: e.target.value } : x)))} placeholder="2 veces por día" />
                <button type="button" aria-label="Quitar tarea" onClick={() => setTasks(tasks.filter((_, j) => j !== i))} className="flex h-11 items-center justify-center rounded-lg text-muted hover:bg-line-soft">
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            ))}
            <Button type="button" variant="secondary" className="h-10 self-start" onClick={() => setTasks([...tasks, { title: '', frequency: '' }])}>
              <Plus size={14} aria-hidden /> Agregar tarea
            </Button>
          </Card>
        </>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-white px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        {s.programId && s.balance !== null && (
          <span className="text-center text-xs text-[#44403c] sm:text-left">
            {attendance === 'DONE'
              ? `Al guardar se descuenta 1 sesión del paquete: quedan ${Math.max(0, s.balance - 1)}.`
              : 'Si la política del centro lo indica, la ausencia también descuenta una sesión.'}
          </span>
        )}
        <Button type="submit" loading={saving} className="h-12 text-[15px] sm:self-end">
          Guardar sesión
        </Button>
      </div>
    </form>
  );
}

export default function SesionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, me } = useMe();
  const { data: s, mutate, error } = useSWR<SessionFull>(`/sessions/${id}`, fetcher);
  const { data: skills } = useSWR<Skill[]>('/skills', fetcher);
  const [msg, setMsg] = useState<string | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);

  if (error) return <Alert tone="red">{error.message}</Alert>;
  if (!s || !skills) return <div className="p-10 text-center text-sm text-muted">Cargando…</div>;
  const open = s.status === 'SCHEDULED' || s.status === 'CONFIRMED';
  const canRecord = open && can('sessions:create') && !me.organization?.readOnly && new Date(s.startsAt).getTime() <= Date.now() + 2 * 3600_000;

  async function revert() {
    const reason = window.prompt('¿Por qué se revierte el registro? Queda en la auditoría.');
    if (!reason) return;
    try {
      await api(`/sessions/${s!.id}/revert`, { method: 'POST', body: { reason } });
      mutate();
    } catch (err) {
      setRevertError((err as ApiError).message);
    }
  }

  return (
    <>
      <Card className="flex flex-col gap-2 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/mascotas/${s.petId}`} className="text-xl font-bold text-brand">
            {s.petName}
          </Link>
          <SessionBadge status={s.status} />
        </div>
        <span className="text-sm text-muted">
          {fmtDay(s.startsAt)} · {fmtTime(s.startsAt)} a {fmtTime(s.endsAt)} · {[s.service, s.trainerName].filter(Boolean).join(' · ')}
        </span>
        <PetAlerts alerts={s.alerts} />
        {s.notes && <p className="text-sm">{s.notes}</p>}
        {s.status === 'CANCELLED' && s.cancelReason && <p className="text-sm text-danger-ink">Cancelada: {s.cancelReason}</p>}
      </Card>
      {msg && <Alert tone="green">{msg}</Alert>}
      {revertError && <Alert tone="red">{revertError}</Alert>}

      {canRecord && (
        <RecordForm
          s={s}
          skills={skills}
          onDone={() => {
            setMsg('Sesión registrada.');
            mutate();
            window.scrollTo({ top: 0 });
          }}
        />
      )}
      {open && !canRecord && <Alert tone="blue">La sesión se puede registrar desde el momento en que empieza.</Alert>}

      {(s.status === 'DONE' || s.status === 'NO_SHOW') && (
        <Card className="flex flex-col gap-5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{s.status === 'DONE' ? 'Registro del entrenamiento' : 'Ausencia registrada'}</h2>
            {can('sessions:delete') && !me.organization?.readOnly && (
              <Button variant="ghost" className="h-9 text-[13px] text-muted" onClick={revert}>
                Revertir registro
              </Button>
            )}
          </div>
          {s.ratings.length > 0 && (
            <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
              {s.ratings.map((r) => (
                <li key={r.skillId} className="flex justify-between rounded-[10px] bg-ground px-3 py-2 text-sm">
                  <span>{r.skill}</span>
                  <span className="font-semibold">
                    {s.previousRatings[r.skillId] != null && s.previousRatings[r.skillId] !== r.value ? `${s.previousRatings[r.skillId]} → ` : ''}
                    {r.value}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {s.commands.length > 0 && <p className="text-sm">Comandos: {s.commands.join(', ')}</p>}
          <KeyValue
            items={[
              ['Objetivos', s.objectives],
              ['Ejercicios', s.exercises],
              ['Resultados', s.results],
              ['Dificultades', s.difficulties],
              ['Comportamiento', s.behavior],
              ['Nivel de respuesta', s.responseLevel ? `${s.responseLevel} de 5` : null],
              ['Próximos objetivos', s.nextGoals],
              ['Nota interna', s.internalNotes],
            ]}
          />
          {s.tasks.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Tareas para casa</h3>
              <ul className="list-disc pl-5 text-sm">
                {s.tasks.map((t) => (
                  <li key={t.id}>
                    {t.title}
                    {t.frequency ? ` · ${t.frequency}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
      <Button variant="ghost" className="self-start" onClick={() => router.back()}>
        ← Volver
      </Button>
    </>
  );
}
