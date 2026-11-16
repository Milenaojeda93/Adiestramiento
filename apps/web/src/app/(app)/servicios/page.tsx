'use client';

import { formatMoney, MODALITY_LABELS } from '@adiestra/shared';
import { Plus } from 'lucide-react';
import { FormEvent, useState } from 'react';
import useSWR from 'swr';
import { Alert, Badge, Button, Card, EmptyState, Modal, PageHeader, Select, TextArea, TextInput } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';
import { useMe } from '@/lib/me';
import type { Service } from '@/lib/types';

const EXAMPLES = ['Adiestramiento básico', 'Obediencia avanzada', 'Modificación de conducta', 'Socialización de cachorros', 'Adiestramiento a domicilio', 'Clases grupales', 'Entrenamiento intensivo', 'Asesoramiento online'];

function ServiceForm({ service, onDone }: { service?: Service; onDone: () => void }) {
  const [f, setF] = useState({
    name: service?.name ?? '',
    category: service?.category ?? '',
    description: service?.description ?? '',
    price: service ? String(service.price) : '',
    sessionsCount: service ? String(service.sessionsCount) : '8',
    durationMinutes: service ? String(service.durationMinutes) : '60',
    modality: service?.modality ?? 'CENTER',
    validityDays: service?.validityDays ? String(service.validityDays) : '',
    conditions: service?.conditions ?? '',
  });
  const [error, setError] = useState<ApiError | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api(service ? `/services/${service.id}` : '/services', {
        method: service ? 'PATCH' : 'POST',
        body: {
          ...f,
          category: f.category || null,
          description: f.description || null,
          conditions: f.conditions || null,
          price: Number(f.price.replace(/\D/g, '') || 0),
          validityDays: f.validityDays ? Number(f.validityDays) : null,
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
      <TextInput label="Nombre" value={f.name} onChange={set('name')} error={fe.name} list="service-examples" />
      <datalist id="service-examples">
        {EXAMPLES.map((e) => (
          <option key={e} value={e} />
        ))}
      </datalist>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Precio (Gs.)"
          inputMode="numeric"
          value={f.price ? Number(f.price.replace(/\D/g, '') || 0).toLocaleString('es-PY') : ''}
          onChange={(e) => setF({ ...f, price: e.target.value.replace(/\D/g, '') })}
          error={fe.price}
        />
        <TextInput label="Cantidad de sesiones" type="number" min={1} value={f.sessionsCount} onChange={set('sessionsCount')} error={fe.sessionsCount} />
        <TextInput label="Duración de cada sesión (min)" type="number" min={15} step={15} value={f.durationMinutes} onChange={set('durationMinutes')} error={fe.durationMinutes} />
        <Select label="Modalidad" value={f.modality} onChange={set('modality')} options={Object.entries(MODALITY_LABELS).map(([value, label]) => ({ value, label }))} />
        <TextInput label="Vigencia del paquete (días)" type="number" min={1} value={f.validityDays} onChange={set('validityDays')} hint="Vacío = no vence" />
        <TextInput label="Categoría" value={f.category} onChange={set('category')} placeholder="Obediencia, Conducta…" />
      </div>
      <TextArea label="Descripción" value={f.description} onChange={set('description')} rows={2} />
      <TextArea label="Condiciones" value={f.conditions} onChange={set('conditions')} rows={2} placeholder="Ej.: las sesiones no usadas vencen a los 90 días" />
      <Button type="submit" className="self-end">
        {service ? 'Guardar' : 'Crear servicio'}
      </Button>
    </form>
  );
}

export default function ServiciosPage() {
  const { can, me } = useMe();
  const ro = me.organization?.readOnly;
  const { data, mutate } = useSWR<Service[]>('/services?all=true', fetcher);
  const [modal, setModal] = useState<null | { service?: Service }>(null);
  async function toggle(s: Service) {
    await api(`/services/${s.id}`, { method: 'PATCH', body: { active: !s.active } });
    mutate();
  }
  return (
    <>
      <PageHeader
        title="Servicios"
        subtitle="Catálogo que se ofrece al contratar un programa"
        actions={
          can('services:create') && !ro ? (
            <Button onClick={() => setModal({})}>
              <Plus size={16} aria-hidden /> Nuevo servicio
            </Button>
          ) : null
        }
      />
      {!data ? (
        <div className="p-10 text-center text-sm text-muted">Cargando…</div>
      ) : data.length === 0 ? (
        <Card>
          <EmptyState title="Todavía no hay servicios" action={can('services:create') && !ro ? <Button onClick={() => setModal({})}>Crear el primero</Button> : null}>
            Por ejemplo: Adiestramiento básico, 8 sesiones de 60 minutos.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {data.map((s) => (
            <Card key={s.id} className={`flex flex-col gap-2 p-5 ${s.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-semibold">{s.name}</h2>
                {!s.active && <Badge>Inactivo</Badge>}
              </div>
              <span className="text-2xl font-bold">{formatMoney(s.price)}</span>
              <span className="text-sm text-muted">
                {s.sessionsCount} {s.sessionsCount === 1 ? 'sesión' : 'sesiones'} de {s.durationMinutes} min · {MODALITY_LABELS[s.modality]}
                {s.validityDays ? ` · vence a los ${s.validityDays} días` : ''}
              </span>
              {s.description && <p className="text-sm">{s.description}</p>}
              {can('services:update') && !ro && (
                <div className="mt-auto flex gap-2 pt-2">
                  <Button variant="secondary" className="h-9 text-[13px]" onClick={() => setModal({ service: s })}>
                    Editar
                  </Button>
                  <Button variant="ghost" className="h-9 text-[13px] text-muted" onClick={() => toggle(s)}>
                    {s.active ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.service ? 'Editar servicio' : 'Nuevo servicio'}>
        {modal && (
          <ServiceForm
            service={modal.service}
            onDone={() => {
              setModal(null);
              mutate();
            }}
          />
        )}
      </Modal>
    </>
  );
}
