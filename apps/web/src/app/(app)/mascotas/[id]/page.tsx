'use client';

import { MODALITY_LABELS, RATING_SCALE } from '@adiestra/shared';
import { MessageCircle, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import useSWR from 'swr';
import { PawIcon } from '@/components/logo';
import { Alert, Badge, Button, Card, EmptyState, Modal, Select, TextArea, TextInput } from '@/components/ui';
import { KeyValue, PackageBar, PetAlerts, ProgramBadge, SearchSelect, SessionBadge, Tabs } from '@/components/widgets';
import { api, ApiError, fetcher } from '@/lib/api';
import { age, fmtDateTime, fmtIsoDate, todayIso, waLink } from '@/lib/format';
import { useMe } from '@/lib/me';
import type { AgendaSession, Client, Pet, ProgramListItem } from '@/lib/types';

type TabKey = 'general' | 'salud' | 'conducta' | 'evaluaciones' | 'programas' | 'sesiones' | 'evolucion' | 'tareas';
const SIZE = { S: 'Chico', M: 'Mediano', L: 'Grande', XL: 'Gigante' } as const;
const SEX = { MALE: 'Macho', FEMALE: 'Hembra' } as const;
const SERIES_COLORS = ['#2f6b4f', '#1d4ed8', '#b45309', '#7c3aed', '#be185d', '#0f766e', '#57534e'];

// ─────────────── Formularios de edición ───────────────

function GeneralForm({ pet, onDone }: { pet: Pet; onDone: () => void }) {
  const [f, setF] = useState({
    name: pet.name,
    breed: pet.breed ?? '',
    sex: pet.sex ?? '',
    birthDate: pet.birthDate ?? '',
    size: pet.size ?? '',
    weightKg: pet.weightKg ?? '',
    color: pet.color ?? '',
    alerts: pet.alerts.join(', '),
  });
  const [error, setError] = useState<ApiError | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/pets/${pet.id}`, {
        method: 'PATCH',
        body: {
          name: f.name,
          breed: f.breed || null,
          sex: f.sex || null,
          birthDate: f.birthDate || null,
          size: f.size || null,
          weightKg: f.weightKg || null,
          color: f.color || null,
          alerts: f.alerts
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean),
        },
      });
      onDone();
    } catch (err) {
      setError(err as ApiError);
    }
  }
  const fe = error?.fieldErrors ?? {};
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && !Object.keys(fe).length && <Alert tone="red">{error.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Nombre" value={f.name} onChange={set('name')} error={fe.name} />
        <TextInput label="Raza" value={f.breed} onChange={set('breed')} />
        <Select label="Sexo" value={f.sex} onChange={set('sex')} options={[{ value: '', label: 'Sin indicar' }, { value: 'FEMALE', label: 'Hembra' }, { value: 'MALE', label: 'Macho' }]} />
        <TextInput label="Fecha de nacimiento" type="date" value={f.birthDate} onChange={set('birthDate')} error={fe.birthDate} />
        <Select
          label="Tamaño"
          value={f.size}
          onChange={set('size')}
          options={[{ value: '', label: 'Sin indicar' }, ...Object.entries(SIZE).map(([value, label]) => ({ value, label }))]}
        />
        <TextInput label="Peso (kg)" value={f.weightKg} onChange={set('weightKg')} error={fe.weightKg} />
        <TextInput label="Color" value={f.color} onChange={set('color')} />
      </div>
      <TextInput
        label="Avisos de seguridad"
        value={f.alerts}
        onChange={set('alerts')}
        hint="Separados por coma. Se muestran en la agenda: Reactivo con perros, Usa bozal, Muerde si lo tocan en las patas…"
      />
      <Button type="submit" className="self-end">
        Guardar
      </Button>
    </form>
  );
}

function HealthForm({ pet, onDone }: { pet: Pet; onDone: () => void }) {
  const h = pet.health;
  const [f, setF] = useState({
    deworming: h.deworming ?? '',
    allergies: h.allergies ?? '',
    conditions: h.conditions ?? '',
    medications: h.medications ?? '',
    restrictions: h.restrictions ?? '',
    vetName: h.vetName ?? '',
    vetPhone: h.vetPhone ?? '',
    emergencyName: h.emergencyName ?? '',
    emergencyPhone: h.emergencyPhone ?? '',
  });
  const [vaccines, setVaccines] = useState(h.vaccines?.length ? h.vaccines.map((v) => ({ name: v.name, date: v.date ?? '', expires: v.expires ?? '' })) : []);
  const [error, setError] = useState<ApiError | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/pets/${pet.id}`, {
        method: 'PATCH',
        body: {
          health: {
            ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v || null])),
            vaccines: vaccines.filter((v) => v.name.trim()).map((v) => ({ name: v.name, date: v.date || null, expires: v.expires || null })),
          },
        },
      });
      onDone();
    } catch (err) {
      setError(err as ApiError);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && <Alert tone="red">{error.message}</Alert>}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Vacunas declaradas</legend>
        {vaccines.map((v, i) => (
          <div key={i} className="grid items-end gap-2 [grid-template-columns:1fr_140px_140px_40px]">
            <TextInput label="Vacuna" value={v.name} onChange={(e) => setVaccines(vaccines.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <TextInput label="Aplicada" type="date" value={v.date} onChange={(e) => setVaccines(vaccines.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
            <TextInput label="Vence" type="date" value={v.expires} onChange={(e) => setVaccines(vaccines.map((x, j) => (j === i ? { ...x, expires: e.target.value } : x)))} />
            <button type="button" aria-label="Quitar vacuna" onClick={() => setVaccines(vaccines.filter((_, j) => j !== i))} className="flex h-11 items-center justify-center rounded-lg text-muted hover:bg-line-soft">
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
        ))}
        <Button type="button" variant="secondary" className="h-9 self-start text-[13px]" onClick={() => setVaccines([...vaccines, { name: '', date: '', expires: '' }])}>
          <Plus size={14} aria-hidden /> Agregar vacuna
        </Button>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Desparasitación" value={f.deworming} onChange={set('deworming')} />
        <TextInput label="Alergias" value={f.allergies} onChange={set('allergies')} />
      </div>
      <TextArea label="Condiciones médicas informadas" value={f.conditions} onChange={set('conditions')} rows={2} />
      <TextArea label="Medicamentos declarados" value={f.medications} onChange={set('medications')} rows={2} />
      <TextArea label="Restricciones físicas" value={f.restrictions} onChange={set('restrictions')} rows={2} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Veterinario de referencia" value={f.vetName} onChange={set('vetName')} />
        <TextInput label="Teléfono del veterinario" value={f.vetPhone} onChange={set('vetPhone')} />
        <TextInput label="Contacto de emergencia" value={f.emergencyName} onChange={set('emergencyName')} />
        <TextInput label="Teléfono de emergencia" value={f.emergencyPhone} onChange={set('emergencyPhone')} />
      </div>
      <p className="text-xs text-muted">Datos declarados por el propietario. No reemplazan la historia clínica veterinaria.</p>
      <Button type="submit" className="self-end">
        Guardar
      </Button>
    </form>
  );
}

function BehaviorForm({ pet, onDone }: { pet: Pet; onDone: () => void }) {
  const b = pet.behavior;
  const [f, setF] = useState({
    temperament: b.temperament ?? '',
    energy: b.energy ? String(b.energy) : '',
    socialization: b.socialization ? String(b.socialization) : '',
    withPeople: b.withPeople ?? '',
    withAnimals: b.withAnimals ?? '',
    fears: b.fears ?? '',
    problems: b.problems ?? '',
    previousTraining: b.previousTraining ?? '',
    notes: b.notes ?? '',
  });
  const [error, setError] = useState<ApiError | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const levels = [{ value: '', label: 'Sin indicar' }, ...[1, 2, 3, 4, 5].map((v) => ({ value: String(v), label: `${v} de 5` }))];
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/pets/${pet.id}`, {
        method: 'PATCH',
        body: { behavior: { ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v || null])), energy: f.energy ? Number(f.energy) : null, socialization: f.socialization ? Number(f.socialization) : null } },
      });
      onDone();
    } catch (err) {
      setError(err as ApiError);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && <Alert tone="red">{error.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextInput label="Temperamento" value={f.temperament} onChange={set('temperament')} />
        <Select label="Nivel de energía" value={f.energy} onChange={set('energy')} options={levels} />
        <Select label="Nivel de socialización" value={f.socialization} onChange={set('socialization')} options={levels} />
      </div>
      <TextArea label="Comportamiento con personas" value={f.withPeople} onChange={set('withPeople')} rows={2} />
      <TextArea label="Comportamiento con otros animales" value={f.withAnimals} onChange={set('withAnimals')} rows={2} />
      <TextArea label="Miedos identificados" value={f.fears} onChange={set('fears')} rows={2} />
      <TextArea label="Conductas problemáticas" value={f.problems} onChange={set('problems')} rows={2} />
      <TextArea label="Experiencias previas de entrenamiento" value={f.previousTraining} onChange={set('previousTraining')} rows={2} />
      <TextArea label="Observaciones del adiestrador" value={f.notes} onChange={set('notes')} rows={3} />
      <Button type="submit" className="self-end">
        Guardar
      </Button>
    </form>
  );
}

function GuardianForm({ petId, onDone }: { petId: string; onDone: () => void }) {
  const [client, setClient] = useState<string | null>(null);
  const [role, setRole] = useState<'OWNER' | 'AUTHORIZED'>('AUTHORIZED');
  const [error, setError] = useState<ApiError | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/pets/${petId}/guardians`, { method: 'POST', body: { clientId: client, role } });
      onDone();
    } catch (err) {
      setError(err as ApiError);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert tone="red">{error.code === 'DUPLICATE' ? 'Esa persona ya es responsable de la mascota.' : error.message}</Alert>}
      <SearchSelect<Client>
        label="Cliente"
        endpoint={(q) => `/clients?limit=8${q ? `&search=${encodeURIComponent(q)}` : ''}`}
        value={client}
        onChange={(c) => setClient(c?.id ?? null)}
        render={(c) => `${c.firstName} ${c.lastName}`}
      />
      <Select
        label="Tipo"
        value={role}
        onChange={(e) => setRole(e.target.value as typeof role)}
        options={[
          { value: 'AUTHORIZED', label: 'Responsable autorizado' },
          { value: 'OWNER', label: 'Propietario titular' },
        ]}
      />
      <Button type="submit" disabled={!client} className="self-end">
        Agregar
      </Button>
    </form>
  );
}

// ─────────────── Evolución ───────────────

interface ProgressPoint {
  skillId: string;
  skill: string;
  value: number;
  ratedAt: string;
  source: 'assessment' | 'session';
}

function EvolutionChart({ points }: { points: ProgressPoint[] }) {
  const series = useMemo(() => {
    const by = new Map<string, ProgressPoint[]>();
    for (const p of points) by.set(p.skill, [...(by.get(p.skill) ?? []), p]);
    return [...by.entries()].map(([skill, pts], i) => ({ skill, pts, color: SERIES_COLORS[i % SERIES_COLORS.length] }));
  }, [points]);
  // Eje X por momento de calificación (evaluación, sesión 1, sesión 2…), no por día: dos registros del mismo día no se superponen.
  const dates = useMemo(() => [...new Set(points.map((p) => p.ratedAt))].sort(), [points]);
  if (!points.length) return <EmptyState title="Todavía no hay calificaciones">Calificá habilidades en la evaluación inicial y en cada sesión para ver la evolución.</EmptyState>;
  const W = 720,
    H = 260,
    L = 40,
    R = 20,
    T = 16,
    B = 34;
  const x = (d: string) => (dates.length === 1 ? (L + W - R) / 2 : L + ((W - L - R) * dates.indexOf(d)) / (dates.length - 1));
  const y = (v: number) => T + ((H - T - B) * (5 - v)) / 4;
  const first = series.map((s) => ({ ...s, delta: s.pts[s.pts.length - 1].value - s.pts[0].value }));
  const best = [...first].sort((a, b) => b.delta - a.delta)[0];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">
        {best && best.delta > 0 ? `${best.skill} mejoró ${best.delta} ${best.delta === 1 ? 'punto' : 'puntos'} desde la primera calificación` : 'Evolución por habilidad'}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Evolución de las habilidades a lo largo del tiempo">
        {[1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#ecebe7" />
            <text x={L - 10} y={y(v) + 4} textAnchor="end" fontSize="12" fill="#57534e">
              {v}
            </text>
          </g>
        ))}
        {dates.map((d, i) =>
          i === 0 || i === dates.length - 1 || dates.length <= 8 ? (
            <text key={d} x={x(d)} y={H - 10} textAnchor="middle" fontSize="11" fill="#57534e">
              {points.find((p) => p.ratedAt === d)?.source === 'assessment' ? 'Inicial' : fmtIsoDate(d.slice(0, 10)).replace(/ de \d{4}$|\.? \d{4}$/, '')}
            </text>
          ) : null,
        )}
        {series.map((s) => (
          <g key={s.skill}>
            <polyline points={s.pts.map((p) => `${x(p.ratedAt)},${y(p.value)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" />
            {s.pts.map((p, i) => (
              <circle key={i} cx={x(p.ratedAt)} cy={y(p.value)} r={p.source === 'assessment' ? 5 : 3.5} fill={p.source === 'assessment' ? '#fff' : s.color} stroke={s.color} strokeWidth="2">
                <title>{`${s.skill}: ${p.value} · ${fmtIsoDate(p.ratedAt.slice(0, 10))}${p.source === 'assessment' ? ' (evaluación)' : ''}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap gap-4 text-[13px]">
        {first.map((s) => (
          <span key={s.skill} className="flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded" style={{ background: s.color }} />
            {s.skill} <span className="text-muted">({s.pts[0].value} → {s.pts[s.pts.length - 1].value})</span>
          </span>
        ))}
        <span className="text-muted">Círculo vacío: evaluación. Escala: {RATING_SCALE.map((r) => `${r.value} ${r.label}`).join(' · ')}</span>
      </div>
    </div>
  );
}

// ─────────────── Página ───────────────

export default function PetPage() {
  const { id } = useParams<{ id: string }>();
  const { can, me } = useMe();
  const ro = me.organization?.readOnly;
  const { data: pet, mutate, error } = useSWR<Pet>(`/pets/${id}`, fetcher);
  const [tab, setTab] = useState<TabKey>('general');
  const [modal, setModal] = useState<null | 'general' | 'salud' | 'conducta' | 'responsable'>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: assessments } = useSWR<{ id: string; assessedAt: string; reason: string; trainerName: string | null; published: boolean }[]>(
    tab === 'evaluaciones' && can('assessments:read') ? `/assessments?petId=${id}` : null,
    fetcher,
  );
  const { data: programs } = useSWR<ProgramListItem[]>(tab === 'programas' || tab === 'general' ? `/programs?petId=${id}` : null, fetcher);
  const { data: sessions } = useSWR<AgendaSession[]>(tab === 'sesiones' ? `/sessions?petId=${id}` : null, fetcher);
  const { data: progress } = useSWR<ProgressPoint[]>(tab === 'evolucion' ? `/pets/${id}/progress` : null, fetcher);
  const { data: tasks, mutate: refreshTasks } = useSWR<{ id: string; title: string; detail: string | null; frequency: string | null; done: boolean; createdAt: string }[]>(
    tab === 'tareas' ? `/pets/${id}/tasks` : null,
    fetcher,
  );

  if (error) return <Alert tone="red">{error.message}</Alert>;
  if (!pet) return <div className="p-10 text-center text-sm text-muted">Cargando…</div>;

  const done = (msg: string) => {
    setModal(null);
    setNotice(msg);
    mutate();
  };
  const editable = can('pets:update') && !ro;
  const active = programs?.find((p) => p.status === 'ACTIVE');
  const expired = (pet.health.vaccines ?? []).filter((v) => v.expires && v.expires < todayIso());

  async function removeGuardian(gid: string) {
    try {
      await api(`/pets/${pet!.id}/guardians/${gid}`, { method: 'DELETE' });
      done('Responsable quitado.');
    } catch (err) {
      setNotice((err as ApiError).message);
    }
  }

  return (
    <>
      <nav aria-label="Ruta" className="flex gap-1.5 text-[13px] text-muted">
        <Link href="/mascotas" className="text-brand">
          Mascotas
        </Link>
        <span>/</span>
        <span>{pet.name}</span>
      </nav>

      <Card className="flex flex-wrap items-start gap-6 p-6">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand" aria-hidden>
          <PawIcon size={40} />
        </div>
        <div className="flex min-w-[260px] flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] font-bold">{pet.name}</h1>
            {active ? <Badge tone="green">En entrenamiento</Badge> : pet.status === 'INACTIVE' ? <Badge>Inactiva</Badge> : null}
          </div>
          <span className="text-[15px] text-[#44403c]">
            {[pet.species !== 'Perro' ? pet.species : null, pet.breed, pet.sex ? SEX[pet.sex] : null, age(pet.birthDate), pet.weightKg ? `${pet.weightKg} kg` : null, pet.size ? SIZE[pet.size as keyof typeof SIZE] : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span className="text-sm text-muted">
            {pet.guardians
              .filter((g) => g.role === 'OWNER')
              .map((g) => `${g.client.firstName} ${g.client.lastName}`)
              .join(', ')}{' '}
            · Desde el {fmtIsoDate(pet.joinedAt)}
          </span>
          <div className="mt-1 flex flex-wrap gap-2">
            <PetAlerts alerts={pet.alerts} />
            {expired.length > 0 && <Badge tone="red">Vacuna vencida: {expired.map((v) => v.name).join(', ')}</Badge>}
            {pet.health.allergies && <Badge tone="amber">Alergia: {pet.health.allergies}</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('assessments:create') && !ro && (
            <Link href={`/evaluaciones/nueva?petId=${pet.id}`} className="inline-flex h-11 items-center rounded-[10px] border border-line bg-white px-4 text-sm font-semibold hover:bg-ground">
              + Evaluación
            </Link>
          )}
          {can('programs:create') && !ro && (
            <Link href={`/programas?nuevo=1&petId=${pet.id}`} className="inline-flex h-11 items-center rounded-[10px] border border-line bg-white px-4 text-sm font-semibold hover:bg-ground">
              + Programa
            </Link>
          )}
          {can('agenda:create') && !ro && (
            <Link href={`/agenda?nueva=1&petId=${pet.id}`} className="inline-flex h-11 items-center rounded-[10px] bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">
              + Sesión
            </Link>
          )}
        </div>
      </Card>

      {notice && <Alert tone="green">{notice}</Alert>}

      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          ['general', 'Información general'],
          ['salud', 'Salud y seguridad'],
          ['conducta', 'Conducta'],
          ['evaluaciones', `Evaluaciones (${pet.counts.assessments})`],
          ['programas', `Programas (${pet.counts.programs})`],
          ['sesiones', `Sesiones (${pet.counts.sessionsDone})`],
          ['evolucion', 'Evolución'],
          ['tareas', 'Tareas para casa'],
        ]}
      />

      {tab === 'general' && (
        <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Datos</h2>
              {editable && (
                <Button variant="secondary" className="h-9 text-[13px]" onClick={() => setModal('general')}>
                  Editar
                </Button>
              )}
            </div>
            <KeyValue
              items={[
                ['Especie', pet.species],
                ['Raza', pet.breed],
                ['Sexo', pet.sex ? SEX[pet.sex] : null],
                ['Nacimiento', pet.birthDate ? `${fmtIsoDate(pet.birthDate)} (${age(pet.birthDate)})` : null],
                ['Peso', pet.weightKg ? `${pet.weightKg} kg` : null],
                ['Tamaño', pet.size ? SIZE[pet.size as keyof typeof SIZE] : null],
                ['Color', pet.color],
                ['Incorporación', fmtIsoDate(pet.joinedAt)],
              ]}
            />
            {active && (
              <div className="flex flex-col gap-2 rounded-[10px] bg-ground p-4">
                <Link href={`/programas/${active.id}`} className="text-sm font-semibold text-brand">
                  {active.service.name}
                </Link>
                <span className="text-xs text-muted">{active.trainer?.name}</span>
                <PackageBar done={active.done} total={active.sessionsContracted} balance={active.balance} />
              </div>
            )}
          </Card>
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Responsables</h2>
              {editable && (
                <Button variant="secondary" className="h-9 text-[13px]" onClick={() => setModal('responsable')}>
                  <Plus size={14} aria-hidden /> Agregar
                </Button>
              )}
            </div>
            {pet.guardians.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 border-t border-line-soft pt-3">
                <div className="flex flex-col">
                  <Link href={`/clientes/${g.client.id}`} className="font-semibold text-brand">
                    {g.client.firstName} {g.client.lastName}
                  </Link>
                  <span className="text-xs text-muted">
                    {g.role === 'OWNER' ? 'Propietario titular' : 'Responsable autorizado'} · {g.client.phone}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {(g.client.whatsapp || g.client.phone) && (
                    <a href={waLink(g.client.whatsapp ?? g.client.phone)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${g.client.firstName}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-brand hover:bg-brand-soft">
                      <MessageCircle size={17} aria-hidden />
                    </a>
                  )}
                  {editable && (
                    <button onClick={() => removeGuardian(g.id)} aria-label={`Quitar a ${g.client.firstName}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-line-soft">
                      <Trash2 size={16} aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === 'salud' && (
        <Card className="flex flex-col gap-5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Salud y seguridad</h2>
            {editable && (
              <Button variant="secondary" className="h-9 text-[13px]" onClick={() => setModal('salud')}>
                Editar
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <caption className="mb-2 text-left text-xs text-muted">Vacunas declaradas</caption>
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1.5 font-semibold">Vacuna</th>
                  <th className="py-1.5 font-semibold">Aplicada</th>
                  <th className="py-1.5 font-semibold">Vence</th>
                </tr>
              </thead>
              <tbody>
                {(pet.health.vaccines ?? []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-2 text-muted">
                      Sin vacunas cargadas
                    </td>
                  </tr>
                )}
                {(pet.health.vaccines ?? []).map((v, i) => (
                  <tr key={i} className="border-t border-line-soft">
                    <td className="py-2">{v.name}</td>
                    <td className="py-2">{fmtIsoDate(v.date)}</td>
                    <td className="py-2">{v.expires && v.expires < todayIso() ? <Badge tone="red">Vencida {fmtIsoDate(v.expires)}</Badge> : fmtIsoDate(v.expires)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <KeyValue
            items={[
              ['Desparasitación', pet.health.deworming],
              ['Alergias', pet.health.allergies],
              ['Condiciones médicas', pet.health.conditions],
              ['Medicamentos', pet.health.medications],
              ['Restricciones físicas', pet.health.restrictions],
              ['Veterinario', [pet.health.vetName, pet.health.vetPhone].filter(Boolean).join(' · ')],
              ['Contacto de emergencia', [pet.health.emergencyName, pet.health.emergencyPhone].filter(Boolean).join(' · ')],
            ]}
          />
        </Card>
      )}

      {tab === 'conducta' && (
        <Card className="flex flex-col gap-5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Perfil conductual</h2>
            {editable && (
              <Button variant="secondary" className="h-9 text-[13px]" onClick={() => setModal('conducta')}>
                Editar
              </Button>
            )}
          </div>
          <KeyValue
            items={[
              ['Temperamento', pet.behavior.temperament],
              ['Energía', pet.behavior.energy ? `${pet.behavior.energy} de 5` : null],
              ['Socialización', pet.behavior.socialization ? `${pet.behavior.socialization} de 5` : null],
              ['Con personas', pet.behavior.withPeople],
              ['Con otros animales', pet.behavior.withAnimals],
              ['Miedos', pet.behavior.fears],
              ['Conductas problemáticas', pet.behavior.problems],
              ['Entrenamiento previo', pet.behavior.previousTraining],
              ['Observaciones del adiestrador', pet.behavior.notes],
            ]}
          />
        </Card>
      )}

      {tab === 'evaluaciones' && (
        <Card>
          {!assessments ? (
            <div className="p-8 text-center text-sm text-muted">Cargando…</div>
          ) : assessments.length === 0 ? (
            <EmptyState
              title="Sin evaluaciones"
              action={
                can('assessments:create') && !ro ? (
                  <Link href={`/evaluaciones/nueva?petId=${pet.id}`} className="font-semibold text-brand">
                    Hacer la evaluación inicial
                  </Link>
                ) : null
              }
            >
              La evaluación inicial es la línea base para medir la evolución.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line-soft">
              {assessments.map((a) => (
                <li key={a.id}>
                  <Link href={`/evaluaciones/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 hover:bg-ground">
                    <span className="flex flex-col">
                      <span className="font-semibold">{fmtIsoDate(a.assessedAt)}</span>
                      <span className="line-clamp-1 text-sm text-muted">{a.reason}</span>
                    </span>
                    <span className="text-xs text-muted">{a.trainerName}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'programas' && (
        <Card>
          {!programs ? (
            <div className="p-8 text-center text-sm text-muted">Cargando…</div>
          ) : programs.length === 0 ? (
            <EmptyState title="Sin programas" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {programs.map((p) => (
                <li key={p.id}>
                  <Link href={`/programas/${p.id}`} className="grid gap-3 px-5 py-4 hover:bg-ground sm:grid-cols-[1fr_260px]">
                    <span className="flex flex-col gap-1">
                      <span className="flex items-center gap-2 font-semibold">
                        {p.service.name} <ProgramBadge status={p.status} />
                      </span>
                      <span className="text-xs text-muted">
                        {p.trainer?.name} · desde el {fmtIsoDate(p.startDate)} · {MODALITY_LABELS[p.service.modality as keyof typeof MODALITY_LABELS]}
                      </span>
                    </span>
                    <PackageBar done={p.done} total={p.sessionsContracted} balance={p.balance} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'sesiones' && (
        <Card>
          {!sessions ? (
            <div className="p-8 text-center text-sm text-muted">Cargando…</div>
          ) : sessions.length === 0 ? (
            <EmptyState title="Sin sesiones" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link href={`/sesiones/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 hover:bg-ground">
                    <span className="flex flex-col">
                      <span className="font-semibold">{fmtDateTime(s.startsAt)}</span>
                      <span className="text-xs text-muted">
                        {[s.service, s.sessionNumber && s.sessionsContracted ? `Sesión ${s.sessionNumber} de ${s.sessionsContracted}` : null, s.trainer?.name].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <SessionBadge status={s.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'evolucion' && <Card className="p-5">{!progress ? <div className="p-8 text-center text-sm text-muted">Cargando…</div> : <EvolutionChart points={progress} />}</Card>}

      {tab === 'tareas' && (
        <Card>
          {!tasks ? (
            <div className="p-8 text-center text-sm text-muted">Cargando…</div>
          ) : tasks.length === 0 ? (
            <EmptyState title="Sin tareas">Se cargan al registrar cada sesión.</EmptyState>
          ) : (
            <ul className="divide-y divide-line-soft">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-3 px-5 py-3.5">
                  <input
                    type="checkbox"
                    id={`t-${t.id}`}
                    checked={t.done}
                    disabled={!can('sessions:update') || ro}
                    onChange={async () => {
                      await api(`/tasks/${t.id}`, { method: 'PATCH', body: { done: !t.done } });
                      refreshTasks();
                    }}
                    className="mt-0.5 h-5 w-5 accent-brand"
                  />
                  <label htmlFor={`t-${t.id}`} className="flex flex-col">
                    <span className={t.done ? 'text-muted line-through' : 'font-medium'}>{t.title}</span>
                    <span className="text-xs text-muted">{[t.frequency, t.detail, `Asignada el ${fmtIsoDate(t.createdAt.slice(0, 10))}`].filter(Boolean).join(' · ')}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Modal open={modal === 'general'} onClose={() => setModal(null)} title="Editar datos">
        {modal === 'general' && <GeneralForm pet={pet} onDone={() => done('Datos guardados.')} />}
      </Modal>
      <Modal open={modal === 'salud'} onClose={() => setModal(null)} title="Salud y seguridad">
        {modal === 'salud' && <HealthForm pet={pet} onDone={() => done('Datos de salud guardados.')} />}
      </Modal>
      <Modal open={modal === 'conducta'} onClose={() => setModal(null)} title="Perfil conductual">
        {modal === 'conducta' && <BehaviorForm pet={pet} onDone={() => done('Perfil conductual guardado.')} />}
      </Modal>
      <Modal open={modal === 'responsable'} onClose={() => setModal(null)} title="Agregar responsable">
        {modal === 'responsable' && <GuardianForm petId={pet.id} onDone={() => done('Responsable agregado.')} />}
      </Modal>
    </>
  );
}
