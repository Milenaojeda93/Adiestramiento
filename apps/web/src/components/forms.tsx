'use client';

import { formatMoney, PAYMENT_METHOD_LABELS } from '@adiestra/shared';
import { Plus, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import useSWR from 'swr';
import { Alert, Button, Select, TextArea, TextInput } from '@/components/ui';
import { SearchSelect } from '@/components/widgets';
import { api, ApiError, fetcher } from '@/lib/api';
import { todayIso } from '@/lib/format';
import type { Client, Pet, PetListItem, Service, Trainer } from '@/lib/types';

type PetDraft = {
  name: string; species: string; breed: string; sex: string; birthDate: string; size: string; weightKg: string; color: string; alerts: string;
  deworming: string; allergies: string; conditions: string; medications: string; restrictions: string; vetName: string; vetPhone: string; emergencyName: string; emergencyPhone: string;
  temperament: string; energy: string; socialization: string; withPeople: string; withAnimals: string; fears: string; problems: string; previousTraining: string; notes: string;
};
const EMPTY_PET: PetDraft = {
  name: '', species: 'Perro', breed: '', sex: '', birthDate: '', size: '', weightKg: '', color: '', alerts: '',
  deworming: '', allergies: '', conditions: '', medications: '', restrictions: '', vetName: '', vetPhone: '', emergencyName: '', emergencyPhone: '',
  temperament: '', energy: '', socialization: '', withPeople: '', withAnimals: '', fears: '', problems: '', previousTraining: '', notes: '',
};
const PET_STEPS = ['Datos', 'Salud', 'Conducta'] as const;
const STEP_FIELDS: Record<number, (keyof PetDraft)[]> = {
  0: ['name', 'species', 'breed', 'sex', 'birthDate', 'size', 'weightKg', 'color', 'alerts'],
  1: ['deworming', 'allergies', 'conditions', 'medications', 'restrictions', 'vetName', 'vetPhone', 'emergencyName', 'emergencyPhone'],
  2: ['temperament', 'energy', 'socialization', 'withPeople', 'withAnimals', 'fears', 'problems', 'previousTraining', 'notes'],
};
const nz = (v: string) => (v.trim() ? v.trim() : null);

/**
 * Alta de mascota en tres pasos (datos, salud, conducta). Al terminar permite
 * registrar otra mascota del mismo propietario sin salir del formulario.
 */
export function NewPetForm({
  ownerId,
  ownerLabel,
  onDone,
  onCancel,
  cancelLabel = 'Cancelar',
}: {
  ownerId?: string;
  ownerLabel?: string;
  /** Se llama al terminar. `petId` es la última mascota registrada (si hubo alguna). */
  onDone: (petId: string | null, ownerId: string | null) => void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const [owner, setOwner] = useState<Client | null>(null);
  const ownerKey = ownerId ?? owner?.id ?? null;
  const ownerName = ownerLabel ?? (owner ? `${owner.firstName} ${owner.lastName}` : '');
  const { data: existing, mutate: refreshExisting } = useSWR<{ items: PetListItem[] }>(ownerKey ? `/pets?clientId=${ownerKey}&status=ALL&limit=50` : null, fetcher);
  const [step, setStep] = useState(0);
  const [f, setF] = useState<PetDraft>(EMPTY_PET);
  const [vaccines, setVaccines] = useState<{ name: string; date: string; expires: string }[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string }[]>([]);
  const [showDone, setShowDone] = useState(false);
  const set = (k: keyof PetDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const fe = { ...(error?.fieldErrors ?? {}), ...localErrors };
  const levels = [{ value: '', label: 'Sin indicar' }, ...[1, 2, 3, 4, 5].map((v) => ({ value: String(v), label: `${v} de 5` }))];

  function checkFirstStep() {
    const errs: Record<string, string> = {};
    if (!ownerKey) errs.ownerClientId = 'Elegí el propietario';
    if (!f.name.trim()) errs.name = 'Ingresá el nombre de la mascota';
    if (f.weightKg && !/^\d{1,3}([.,]\d{1,2})?$/.test(f.weightKg.trim())) errs.weightKg = 'Peso no válido';
    setLocalErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function save() {
    if (!checkFirstStep()) return setStep(0);
    setSaving(true);
    setError(null);
    try {
      const pet = await api<{ id: string; name: string }>('/pets', {
        method: 'POST',
        body: {
          ownerClientId: ownerKey,
          name: f.name.trim(),
          species: f.species,
          breed: nz(f.breed),
          sex: f.sex || null,
          birthDate: f.birthDate || null,
          size: f.size || null,
          weightKg: nz(f.weightKg),
          color: nz(f.color),
          alerts: f.alerts.split(',').map((a) => a.trim()).filter(Boolean),
          health: {
            ...Object.fromEntries(STEP_FIELDS[1].map((k) => [k, nz(f[k])])),
            vaccines: vaccines.filter((v) => v.name.trim()).map((v) => ({ name: v.name.trim(), date: v.date || null, expires: v.expires || null })),
          },
          behavior: {
            ...Object.fromEntries(STEP_FIELDS[2].map((k) => [k, nz(f[k])])),
            energy: f.energy ? Number(f.energy) : null,
            socialization: f.socialization ? Number(f.socialization) : null,
          },
        },
      });
      setCreated([...created, { id: pet.id, name: pet.name }]);
      setShowDone(true);
      refreshExisting();
    } catch (err) {
      const e = err as ApiError;
      setError(e);
      const bad = Object.keys(e.fieldErrors ?? {});
      const firstStep = [0, 1, 2].find((i) => bad.some((k) => STEP_FIELDS[i].includes(k as keyof PetDraft) || k.startsWith(i === 1 ? 'health' : i === 2 ? 'behavior' : '_')));
      if (firstStep !== undefined) setStep(firstStep);
    } finally {
      setSaving(false);
    }
  }

  function anotherPet() {
    setF(EMPTY_PET);
    setVaccines([]);
    setStep(0);
    setError(null);
    setLocalErrors({});
    setShowDone(false);
  }

  function next(e: FormEvent) {
    e.preventDefault();
    if (step === 0 && !checkFirstStep()) return;
    if (step < PET_STEPS.length - 1) setStep(step + 1);
    else save();
  }

  const last = created[created.length - 1];
  if (showDone && last) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="green">
          <strong>{last.name}</strong> quedó registrada como mascota de <strong>{ownerName}</strong>.
        </Alert>
        {!!existing?.items.length && (
          <div className="rounded-xl border border-line p-4">
            <p className="mb-2 text-sm font-semibold">Mascotas de {ownerName}</p>
            <ul className="flex flex-wrap gap-2">
              {existing.items.map((p) => (
                <li key={p.id} className="rounded-full bg-line-soft px-3 py-1 text-sm">
                  {p.name}
                  {p.breed ? <span className="text-muted"> · {p.breed}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-sm text-muted">¿Tiene otra mascota? Podés registrarla ahora con el mismo propietario.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onDone(last.id, ownerKey)}>
            Terminar
          </Button>
          <Button type="button" onClick={anotherPet}>
            <Plus size={14} aria-hidden /> Agregar otra mascota
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={next} className="flex flex-col gap-4" noValidate>
      <ol className="flex gap-2" aria-label="Pasos">
        {PET_STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <button
              type="button"
              onClick={() => (i === 0 || checkFirstStep() ? setStep(i) : undefined)}
              aria-current={i === step ? 'step' : undefined}
              className={`w-full rounded-lg px-2 py-2 text-left text-[13px] font-semibold transition ${i === step ? 'bg-brand text-white' : i < step ? 'bg-brand-soft text-brand' : 'bg-line-soft text-muted'}`}
            >
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      {error && !Object.keys(error.fieldErrors ?? {}).length && <Alert tone="red">{error.message}</Alert>}

      {step === 0 && (
        <>
          {ownerId ? (
            <p className="text-sm">
              Propietario: <strong>{ownerLabel}</strong>
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <SearchSelect<Client>
                label="Propietario"
                endpoint={(q) => `/clients?limit=8${q ? `&search=${encodeURIComponent(q)}` : ''}`}
                value={owner?.id ?? null}
                onChange={(c) => setOwner(c ?? null)}
                render={(c) => `${c.firstName} ${c.lastName}${c.documentId ? ` · ${c.documentId}` : ''}${c.phone ? ` · ${c.phone}` : ''}`}
                placeholder="Buscá por nombre, documento o teléfono"
                error={fe.ownerClientId}
              />
              <a href="/clientes?nuevo=1" className="self-start text-[13px] font-semibold text-brand hover:underline">
                ¿Es un propietario nuevo? Registralo primero
              </a>
            </div>
          )}
          {ownerKey && !!existing?.items.length && (
            <p className="rounded-lg bg-line-soft px-3 py-2 text-[13px] text-muted">
              Ya tiene registradas: <strong className="text-ink">{existing.items.map((p) => p.name).join(', ')}</strong>
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Nombre" value={f.name} onChange={set('name')} error={fe.name} autoFocus />
            <Select label="Especie" value={f.species} onChange={set('species')} options={['Perro', 'Gato', 'Otra'].map((v) => ({ value: v, label: v }))} />
            <TextInput label="Raza" value={f.breed} onChange={set('breed')} error={fe.breed} placeholder="Mestizo, Labrador…" />
            <Select label="Sexo" value={f.sex} onChange={set('sex')} options={[{ value: '', label: 'Sin indicar' }, { value: 'FEMALE', label: 'Hembra' }, { value: 'MALE', label: 'Macho' }]} />
            <TextInput label="Fecha de nacimiento" type="date" value={f.birthDate} onChange={set('birthDate')} error={fe.birthDate} hint="Aproximada si no se sabe" />
            <Select
              label="Tamaño"
              value={f.size}
              onChange={set('size')}
              options={[{ value: '', label: 'Sin indicar' }, { value: 'S', label: 'Chico' }, { value: 'M', label: 'Mediano' }, { value: 'L', label: 'Grande' }, { value: 'XL', label: 'Gigante' }]}
            />
            <TextInput label="Peso (kg)" inputMode="decimal" value={f.weightKg} onChange={set('weightKg')} error={fe.weightKg} />
            <TextInput label="Color" value={f.color} onChange={set('color')} />
          </div>
          <TextInput label="Avisos de seguridad" value={f.alerts} onChange={set('alerts')} hint="Separados por coma. Se muestran en la agenda: Reactivo con perros, Usa bozal…" />
        </>
      )}

      {step === 1 && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Vacunas</legend>
            {vaccines.length === 0 && <p className="text-[13px] text-muted">Sin vacunas cargadas.</p>}
            {vaccines.map((v, i) => (
              <div key={i} className="grid items-end gap-2 [grid-template-columns:1fr_130px_130px_40px]">
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
          <TextArea label="Medicamentos" value={f.medications} onChange={set('medications')} rows={2} />
          <TextArea label="Restricciones físicas" value={f.restrictions} onChange={set('restrictions')} rows={2} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Veterinario de referencia" value={f.vetName} onChange={set('vetName')} />
            <TextInput label="Teléfono del veterinario" type="tel" value={f.vetPhone} onChange={set('vetPhone')} />
            <TextInput label="Contacto de emergencia" value={f.emergencyName} onChange={set('emergencyName')} />
            <TextInput label="Teléfono de emergencia" type="tel" value={f.emergencyPhone} onChange={set('emergencyPhone')} />
          </div>
          <p className="text-xs text-muted">Datos declarados por el propietario. No reemplazan la historia clínica veterinaria.</p>
        </>
      )}

      {step === 2 && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInput label="Temperamento" value={f.temperament} onChange={set('temperament')} placeholder="Tranquilo, ansioso…" />
            <Select label="Nivel de energía" value={f.energy} onChange={set('energy')} options={levels} />
            <Select label="Socialización" value={f.socialization} onChange={set('socialization')} options={levels} />
          </div>
          <TextArea label="Motivo de consulta / conductas a trabajar" value={f.problems} onChange={set('problems')} rows={2} />
          <TextArea label="Con personas" value={f.withPeople} onChange={set('withPeople')} rows={2} />
          <TextArea label="Con otros animales" value={f.withAnimals} onChange={set('withAnimals')} rows={2} />
          <TextArea label="Miedos" value={f.fears} onChange={set('fears')} rows={2} />
          <TextArea label="Entrenamiento previo" value={f.previousTraining} onChange={set('previousTraining')} rows={2} />
          <TextArea label="Observaciones" value={f.notes} onChange={set('notes')} rows={2} />
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <Button type="button" variant="secondary" onClick={() => (step === 0 ? (created.length ? onDone(last?.id ?? null, ownerKey) : onCancel()) : setStep(step - 1))}>
          {step === 0 ? (created.length ? 'Terminar' : cancelLabel) : 'Atrás'}
        </Button>
        <div className="flex flex-wrap gap-2">
          {step > 0 && step < PET_STEPS.length - 1 && (
            <Button type="button" variant="secondary" loading={saving} onClick={save}>
              Guardar sin completar
            </Button>
          )}
          {step === 0 && (
            <Button type="button" variant="secondary" loading={saving} onClick={save}>
              Guardar solo datos
            </Button>
          )}
          <Button type="submit" loading={saving && step === PET_STEPS.length - 1}>
            {step < PET_STEPS.length - 1 ? `Siguiente: ${PET_STEPS[step + 1]}` : 'Registrar mascota'}
          </Button>
        </div>
      </div>
    </form>
  );
}

// ─────────────── Pago ───────────────

export function PaymentForm({ clientId, clientName, debt, onDone, onCancel }: { clientId: string; clientName: string; debt: number; onDone: (paymentId: string) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(String(debt));
  const [method, setMethod] = useState<keyof typeof PAYMENT_METHOD_LABELS>('TRANSFER');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [reference, setReference] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const n = Number(amount.replace(/\D/g, '')) || 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const p = await api<{ id: string }>('/payments', { method: 'POST', body: { clientId, amount: n, method, paidAt, reference: reference || null } });
      onDone(p.id);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setSaving(false);
    }
  }
  const fe = error?.fieldErrors ?? {};
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm">
        {clientName} debe <strong>{formatMoney(debt)}</strong>. El pago se aplica a las cuotas más antiguas primero.
      </p>
      {error && !Object.keys(fe).length && <Alert tone="red">{error.message}</Alert>}
      <TextInput
        label="Monto recibido (Gs.)"
        inputMode="numeric"
        value={amount ? Number(amount.replace(/\D/g, '') || 0).toLocaleString('es-PY') : ''}
        onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
        error={fe.amount}
        hint={n > 0 && n < debt ? `Pago parcial: quedan ${formatMoney(debt - n)} pendientes.` : undefined}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Método"
          value={method}
          onChange={(e) => setMethod(e.target.value as typeof method)}
          options={Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <TextInput label="Fecha" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} error={fe.paidAt} />
      </div>
      <TextInput label="Referencia (opcional)" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N.º de transferencia o comprobante" />
      <p className="text-xs text-muted">Se emite un recibo interno numerado. No reemplaza la factura legal.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving} disabled={n <= 0}>
          Registrar pago
        </Button>
      </div>
    </form>
  );
}

// ─────────────── Programa ───────────────

export function ProgramForm({ petId: presetPet, onDone, onCancel }: { petId?: string; onDone: (id: string) => void; onCancel: () => void }) {
  const [petId, setPetId] = useState<string | null>(presetPet ?? null);
  const { data: pet } = useSWR<Pet>(petId ? `/pets/${petId}` : null, fetcher);
  const { data: services } = useSWR<Service[]>('/services', fetcher);
  const { data: trainers } = useSWR<Trainer[]>('/trainers', fetcher);
  const [f, setF] = useState({ clientId: '', serviceId: '', trainerId: '', startDate: todayIso(), installments: '1', firstDueDate: todayIso(), discount: '', price: '', sessions: '', goals: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const service = services?.find((s) => s.id === f.serviceId);
  const owners = pet?.guardians ?? [];
  const clientId = f.clientId || owners.find((g) => g.role === 'OWNER')?.client.id || '';
  const trainerId = f.trainerId || trainers?.[0]?.id || '';
  const price = f.price !== '' ? Number(f.price) : service?.price ?? 0;
  const discount = Number(f.discount || 0);
  const n = Math.max(1, Number(f.installments || 1));
  const net = Math.max(0, price - discount);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const p = await api<{ id: string }>('/programs', {
        method: 'POST',
        body: {
          petId,
          clientId,
          serviceId: f.serviceId,
          trainerId,
          startDate: f.startDate,
          installments: n,
          firstDueDate: f.firstDueDate,
          discount,
          price: f.price !== '' ? price : undefined,
          sessionsContracted: f.sessions ? Number(f.sessions) : undefined,
          goals: f.goals || null,
        },
      });
      onDone(p.id);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setSaving(false);
    }
  }
  const fe = error?.fieldErrors ?? {};
  const money = (v: string, k: 'price' | 'discount') => ({
    inputMode: 'numeric' as const,
    value: v ? Number(v).toLocaleString('es-PY') : '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(/\D/g, '') }),
  });
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && !Object.keys(fe).length && <Alert tone="red">{error.message}</Alert>}
      {presetPet ? (
        <p className="text-sm">
          Mascota: <strong>{pet?.name ?? '…'}</strong>
        </p>
      ) : (
        <SearchSelect<PetListItem>
          label="Mascota"
          endpoint={(q) => `/pets?limit=8${q ? `&search=${encodeURIComponent(q)}` : ''}`}
          value={petId}
          onChange={(p) => setPetId(p?.id ?? null)}
          render={(p) => `${p.name}${p.owners ? ` · ${p.owners}` : ''}`}
          error={fe.petId}
        />
      )}
      {owners.length > 1 && (
        <Select
          label="Quién contrata"
          value={clientId}
          onChange={(e) => setF({ ...f, clientId: e.target.value })}
          options={owners.map((g) => ({ value: g.client.id, label: `${g.client.firstName} ${g.client.lastName}` }))}
        />
      )}
      <Select
        label="Servicio"
        value={f.serviceId}
        onChange={(e) => setF({ ...f, serviceId: e.target.value, price: '', sessions: '' })}
        error={fe.serviceId}
        options={[{ value: '', label: services?.length ? 'Elegí un servicio' : 'Primero creá servicios en Servicios' }, ...(services ?? []).map((s) => ({ value: s.id, label: `${s.name} · ${formatMoney(s.price)}` }))]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Entrenador a cargo" value={trainerId} onChange={(e) => setF({ ...f, trainerId: e.target.value })} options={(trainers ?? []).map((t) => ({ value: t.id, label: t.name }))} />
        <TextInput label="Inicio" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} error={fe.startDate} />
        <TextInput label="Sesiones" type="number" min={1} value={f.sessions || (service ? String(service.sessionsCount) : '')} onChange={(e) => setF({ ...f, sessions: e.target.value })} />
        <TextInput label="Precio (Gs.)" {...money(f.price !== '' ? f.price : service ? String(service.price) : '', 'price')} />
        <TextInput label="Descuento (Gs.)" {...money(f.discount, 'discount')} error={fe.discount} />
        <Select label="Forma de pago" value={f.installments} onChange={(e) => setF({ ...f, installments: e.target.value })} options={[1, 2, 3, 4, 6, 12].map((v) => ({ value: String(v), label: v === 1 ? 'Un solo pago' : `${v} cuotas mensuales` }))} />
        <TextInput label={n === 1 ? 'Vencimiento del pago' : 'Vence la primera cuota'} type="date" value={f.firstDueDate} onChange={(e) => setF({ ...f, firstDueDate: e.target.value })} />
      </div>
      <TextArea label="Objetivos del programa" value={f.goals} onChange={(e) => setF({ ...f, goals: e.target.value })} rows={2} />
      {service && (
        <Alert tone="blue">
          Total {formatMoney(net)}
          {n > 1 ? ` en ${n} cuotas de ${formatMoney(Math.floor(net / n))}` : ''}. Se acreditan {f.sessions || service.sessionsCount} sesiones al paquete.
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving} disabled={!petId || !f.serviceId || !clientId}>
          Crear programa
        </Button>
      </div>
    </form>
  );
}
