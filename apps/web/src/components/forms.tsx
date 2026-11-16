'use client';

import { formatMoney, PAYMENT_METHOD_LABELS } from '@adiestra/shared';
import { FormEvent, useState } from 'react';
import useSWR from 'swr';
import { Alert, Button, Select, TextArea, TextInput } from '@/components/ui';
import { SearchSelect } from '@/components/widgets';
import { api, ApiError, fetcher } from '@/lib/api';
import { todayIso } from '@/lib/format';
import type { Client, Pet, PetListItem, Service, Trainer } from '@/lib/types';

export function NewPetForm({ ownerId, ownerLabel, onDone, onCancel }: { ownerId?: string; ownerLabel?: string; onDone: (id: string) => void; onCancel: () => void }) {
  const [owner, setOwner] = useState<string | null>(ownerId ?? null);
  const [form, setForm] = useState({ name: '', species: 'Perro', breed: '', sex: '', birthDate: '', size: '', weightKg: '', color: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const pet = await api<{ id: string }>('/pets', {
        method: 'POST',
        body: {
          ...form,
          ownerClientId: owner ?? undefined,
          breed: form.breed || null,
          sex: form.sex || null,
          birthDate: form.birthDate || null,
          size: form.size || null,
          weightKg: form.weightKg || null,
          color: form.color || null,
        },
      });
      onDone(pet.id);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setSaving(false);
    }
  }
  const fe = error?.fieldErrors ?? {};
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && !Object.keys(fe).length && <Alert tone="red">{error.message}</Alert>}
      {ownerId ? (
        <p className="text-sm">
          Propietario: <strong>{ownerLabel}</strong>
        </p>
      ) : (
        <SearchSelect<Client>
          label="Propietario"
          endpoint={(q) => `/clients?limit=8${q ? `&search=${encodeURIComponent(q)}` : ''}`}
          value={owner}
          onChange={(c) => setOwner(c?.id ?? null)}
          render={(c) => `${c.firstName} ${c.lastName}${c.documentId ? ` · ${c.documentId}` : ''}`}
          placeholder="Buscá por nombre o documento"
          error={fe.ownerClientId}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Nombre" value={form.name} onChange={set('name')} error={fe.name} />
        <Select label="Especie" value={form.species} onChange={set('species')} options={['Perro', 'Gato', 'Otra'].map((v) => ({ value: v, label: v }))} />
        <TextInput label="Raza" value={form.breed} onChange={set('breed')} error={fe.breed} placeholder="Mestizo, Labrador…" />
        <Select
          label="Sexo"
          value={form.sex}
          onChange={set('sex')}
          options={[
            { value: '', label: 'Sin indicar' },
            { value: 'FEMALE', label: 'Hembra' },
            { value: 'MALE', label: 'Macho' },
          ]}
        />
        <TextInput label="Fecha de nacimiento" type="date" value={form.birthDate} onChange={set('birthDate')} error={fe.birthDate} hint="Aproximada si no se sabe" />
        <Select
          label="Tamaño"
          value={form.size}
          onChange={set('size')}
          options={[
            { value: '', label: 'Sin indicar' },
            { value: 'S', label: 'Chico' },
            { value: 'M', label: 'Mediano' },
            { value: 'L', label: 'Grande' },
            { value: 'XL', label: 'Gigante' },
          ]}
        />
        <TextInput label="Peso (kg)" inputMode="decimal" value={form.weightKg} onChange={set('weightKg')} error={fe.weightKg} />
        <TextInput label="Color" value={form.color} onChange={set('color')} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving}>
          Registrar mascota
        </Button>
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
