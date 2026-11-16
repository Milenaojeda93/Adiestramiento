'use client';

import { RATING_SCALE } from '@adiestra/shared';
import { Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Alert, Button, Card } from '@/components/ui';
import { fetcher } from '@/lib/api';
import { age, fmtIsoDate } from '@/lib/format';
import { useMe } from '@/lib/me';

interface Assessment {
  id: string;
  petId: string;
  petName: string;
  breed: string | null;
  birthDate: string | null;
  trainerName: string | null;
  assessedAt: string;
  reason: string;
  anxiety: number | null;
  published: boolean;
  ratings: { skill: string; value: number }[];
  owners: { firstName: string; lastName: string; phone: string }[];
  [k: string]: unknown;
}

const SECTIONS: [string, string][] = [
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

/** Informe de evaluación inicial. "Imprimir / PDF" usa el diálogo del navegador (Guardar como PDF). */
export default function EvaluacionPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useMe();
  const { data: a, error } = useSWR<Assessment>(`/assessments/${id}`, fetcher);
  if (error) return <Alert tone="red">{error.message}</Alert>;
  if (!a) return <div className="p-10 text-center text-sm text-muted">Cargando…</div>;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/mascotas/${a.petId}`} className="text-sm text-brand">
          ← Volver a {a.petName}
        </Link>
        <Button onClick={() => window.print()}>
          <Printer size={16} aria-hidden /> Imprimir o guardar PDF
        </Button>
      </div>
      <Card className="print-sheet flex flex-col gap-6 p-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">{me.organization?.name}</p>
            <h1 className="text-2xl font-bold">Evaluación conductual inicial</h1>
          </div>
          <div className="text-right text-sm">
            <p>{fmtIsoDate(a.assessedAt)}</p>
            <p className="text-xs text-muted">N.º {a.id.slice(0, 8).toUpperCase()}</p>
          </div>
        </header>
        <section className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted">Mascota</p>
            <p className="font-semibold">{a.petName}</p>
            <p>{[a.breed, age(a.birthDate)].filter(Boolean).join(' · ')}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Propietario</p>
            {a.owners.map((o) => (
              <p key={o.phone}>
                {o.firstName} {o.lastName} · {o.phone}
              </p>
            ))}
          </div>
          <div>
            <p className="text-xs text-muted">Evaluó</p>
            <p>{a.trainerName}</p>
          </div>
        </section>
        <section>
          <h2 className="mb-1 text-sm font-semibold">Motivo de consulta</h2>
          <p className="whitespace-pre-line text-sm">{a.reason}</p>
        </section>
        {a.ratings.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold">Línea base de habilidades</h2>
            <table className="w-full text-sm">
              <tbody>
                {a.ratings.map((r) => (
                  <tr key={r.skill} className="border-t border-line-soft">
                    <td className="py-1.5">{r.skill}</td>
                    <td className="py-1.5 text-right font-semibold">
                      {r.value} · {RATING_SCALE.find((s) => s.value === r.value)?.label}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {SECTIONS.filter(([k]) => a[k]).map(([k, l]) => (
          <section key={k}>
            <h2 className="mb-1 text-sm font-semibold">{l}</h2>
            <p className="whitespace-pre-line text-sm">{String(a[k])}</p>
          </section>
        ))}
        {a.anxiety && (
          <p className="text-sm">
            <strong>Nivel de ansiedad observado:</strong> {a.anxiety} de 5
          </p>
        )}
        <footer className="border-t border-line pt-4 text-xs text-muted">
          Esta es una evaluación conductual realizada por el adiestrador. No constituye un diagnóstico médico ni veterinario.
        </footer>
      </Card>
    </>
  );
}
