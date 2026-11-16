'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import useSWR from 'swr';
import { Alert, Button, Card, PageHeader, Select, TextArea, TextInput } from '@/components/ui';
import { RatingPicker } from '@/components/widgets';
import { api, ApiError, fetcher } from '@/lib/api';
import { todayIso } from '@/lib/format';
import type { Pet, Skill } from '@/lib/types';

const FIELDS: [string, string][] = [
  ['ownerGoals', 'Objetivos del propietario'],
  ['obedience', 'Nivel de obediencia'],
  ['socialization', 'Socialización'],
  ['homeBehavior', 'Comportamiento en el hogar'],
  ['publicBehavior', 'Comportamiento en espacios públicos'],
  ['strangers', 'Reacción ante desconocidos'],
  ['otherDogs', 'Reacción ante otros perros'],
  ['unwantedBehaviors', 'Conductas no deseadas'],
  ['background', 'Antecedentes relevantes'],
  ['observations', 'Observaciones del entrenador'],
  ['recommendations', 'Recomendaciones iniciales'],
];

function NuevaInner() {
  const router = useRouter();
  const petId = useSearchParams().get('petId') ?? '';
  const { data: pet } = useSWR<Pet>(petId ? `/pets/${petId}` : null, fetcher);
  const { data: skills } = useSWR<Skill[]>('/skills', fetcher);
  const [f, setF] = useState<Record<string, string>>({ assessedAt: todayIso(), reason: '', anxiety: '' });
  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { petId, published, ratings: Object.entries(ratings).filter(([, v]) => v).map(([skillId, value]) => ({ skillId, value })) };
      for (const [k, v] of Object.entries(f)) body[k] = v || null;
      body.anxiety = f.anxiety ? Number(f.anxiety) : null;
      const a = await api<{ id: string }>('/assessments', { method: 'POST', body });
      router.push(`/evaluaciones/${a.id}`);
    } catch (err) {
      setError(err as ApiError);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  }
  if (!petId) return <Alert tone="red">Falta indicar la mascota.</Alert>;
  const fe = error?.fieldErrors ?? {};
  return (
    <>
      <PageHeader title={`Evaluación inicial${pet ? ` · ${pet.name}` : ''}`} subtitle="Punto de partida para medir la evolución" />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <Alert tone="red">{error.message}</Alert>}
        <Card className="grid gap-4 p-5 sm:grid-cols-[200px_1fr]">
          <TextInput label="Fecha" type="date" value={f.assessedAt} onChange={(e) => setF({ ...f, assessedAt: e.target.value })} />
          <TextInput label="Motivo de consulta" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} error={fe.reason} placeholder="Ej.: tira de la correa y ladra a otros perros" />
        </Card>
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold">Línea base de habilidades</h2>
          <p className="-mt-2 text-sm text-muted">1 No lo hace · 2 Lo intenta · 3 Con ayuda · 4 Sin ayuda · 5 Con distracciones. Dejá sin marcar lo que no evaluaste.</p>
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {skills?.filter((s) => s.active).map((s) => (
              <RatingPicker key={s.id} label={s.name} value={ratings[s.id] ?? null} onChange={(v) => setRatings({ ...ratings, [s.id]: v })} />
            ))}
          </div>
        </Card>
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          {FIELDS.map(([k, l]) => (
            <TextArea key={k} label={l} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} rows={3} />
          ))}
          <Select
            label="Nivel de ansiedad observado"
            value={f.anxiety}
            onChange={(e) => setF({ ...f, anxiety: e.target.value })}
            options={[{ value: '', label: 'Sin indicar' }, ...[1, 2, 3, 4, 5].map((v) => ({ value: String(v), label: `${v} de 5` }))]}
          />
        </Card>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="h-5 w-5 accent-brand" />
          Visible para el propietario en el portal
        </label>
        <p className="text-xs text-muted">Es una evaluación conductual del adiestrador. No es un diagnóstico médico ni veterinario.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            Guardar evaluación
          </Button>
        </div>
      </form>
    </>
  );
}

export default function NuevaEvaluacionPage() {
  return (
    <Suspense>
      <NuevaInner />
    </Suspense>
  );
}
