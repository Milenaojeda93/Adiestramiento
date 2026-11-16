'use client';

import { FormEvent, useEffect, useState } from 'react';
import useSWR from 'swr';
import { Alert, Badge, Button, Card, PageHeader, TextInput } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { useMe } from '@/lib/me';
import { PoliciesCard, SkillsCard, WorkingHoursCard } from './extras';

interface OrgData {
  organization: { name: string; legalName: string | null; ruc: string | null; phone: string | null; email: string | null; address: string | null; currency: string; timezone: string; noShowConsumes: boolean; cancelHours: number };
  subscription: { status: string; plan: string; trialEndsAt: string | null; currentPeriodEnd: string | null } | null;
  branches: { id: string; name: string; isDefault: boolean; address: string | null }[];
  features: Record<string, { enabled: boolean; limit: number | null }>;
}

const FEATURE_LABELS: Record<string, string> = {
  'trainers.max': 'Entrenadores',
  'branches.max': 'Sucursales',
  'storage.mb': 'Almacenamiento',
  'finance.enabled': 'Gestión financiera',
  'reports.enabled': 'Reportes',
  'documents.enabled': 'Documentos y contratos',
  'groups.enabled': 'Clases grupales',
  'notifications.enabled': 'Notificaciones',
  'portal.enabled': 'Portal del propietario',
  'boarding.enabled': 'Alojamiento',
  'branding.enabled': 'Personalización de marca',
};

export default function ConfiguracionPage() {
  const { can, me, refresh } = useMe();
  const { data, mutate } = useSWR<OrgData>('/organization', fetcher);
  const [form, setForm] = useState({ name: '', legalName: '', ruc: '', phone: '', email: '', address: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const editable = can('settings:update') && !me.organization?.readOnly;

  useEffect(() => {
    if (!data) return;
    const o = data.organization;
    setForm({ name: o.name, legalName: o.legalName ?? '', ruc: o.ruc ?? '', phone: o.phone ?? '', email: o.email ?? '', address: o.address ?? '' });
  }, [data]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const nul = (v: string) => (v.trim() ? v.trim() : null);
      await api('/organization', {
        method: 'PATCH',
        body: { name: form.name, legalName: nul(form.legalName), ruc: nul(form.ruc), phone: nul(form.phone), email: nul(form.email), address: nul(form.address) },
      });
      setSaved(true);
      mutate();
      refresh();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <div className="p-10 text-center text-sm text-muted">Cargando…</div>;
  const fe = error?.fieldErrors ?? {};
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <PageHeader title="Configuración" />
      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
        <Card className="p-5">
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <h2 className="text-base font-semibold">Datos de la empresa</h2>
            <p className="-mt-2 text-sm text-muted">Aparecen en recibos, contratos y certificados.</p>
            {saved && <Alert tone="green">Datos guardados.</Alert>}
            {error && !Object.keys(fe).length && <Alert tone="red">{error.message}</Alert>}
            <fieldset disabled={!editable} className="flex flex-col gap-4">
              <TextInput label="Nombre comercial" value={form.name} onChange={set('name')} error={fe.name} />
              <TextInput label="Razón social" value={form.legalName} onChange={set('legalName')} error={fe.legalName} />
              <TextInput label="RUC" value={form.ruc} onChange={set('ruc')} error={fe.ruc} placeholder="80012345-6" />
              <TextInput label="Teléfono" value={form.phone} onChange={set('phone')} error={fe.phone} />
              <TextInput label="Correo" type="email" value={form.email} onChange={set('email')} error={fe.email} />
              <TextInput label="Dirección" value={form.address} onChange={set('address')} error={fe.address} />
            </fieldset>
            {editable && (
              <Button type="submit" loading={saving} className="self-start">
                Guardar
              </Button>
            )}
          </form>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-base font-semibold">Plan y suscripción</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold">{data.subscription?.plan}</span>
              {data.subscription?.status === 'TRIAL' && <Badge tone="blue">Prueba hasta el {fmtDate(data.subscription.trialEndsAt)}</Badge>}
              {data.subscription?.status === 'ACTIVE' && <Badge tone="green">Activa hasta el {fmtDate(data.subscription.currentPeriodEnd)}</Badge>}
            </div>
            <ul className="flex flex-col text-sm">
              {Object.entries(FEATURE_LABELS).map(([code, label]) => {
                const f = data.features[code];
                const value = !f
                  ? 'No incluido'
                  : code.endsWith('.max')
                    ? f.limit === null
                      ? 'Sin límite'
                      : `Hasta ${f.limit}`
                    : code === 'storage.mb'
                      ? `${Math.round((f.limit ?? 0) / 1024)} GB`
                      : f.enabled
                        ? 'Incluido'
                        : 'No incluido';
                return (
                  <li key={code} className="flex justify-between border-t border-line-soft py-2">
                    <span>{label}</span>
                    <span className={value === 'No incluido' ? 'text-faint' : 'font-medium'}>{value}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card className="flex flex-col gap-2 p-5">
            <h2 className="text-base font-semibold">Sucursales</h2>
            {data.branches.map((b) => (
              <div key={b.id} className="flex items-center justify-between border-t border-line-soft py-2 text-sm">
                <span>{b.name}</span>
                {b.isDefault && <Badge>Principal</Badge>}
              </div>
            ))}
            <p className="text-xs text-muted">Moneda: {data.organization.currency} · Zona horaria: {data.organization.timezone}</p>
          </Card>
        </div>
      </div>
      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
        <div className="flex flex-col gap-4">
          <PoliciesCard noShowConsumes={data.organization.noShowConsumes} cancelHours={data.organization.cancelHours} editable={editable} onSaved={() => mutate()} />
          <SkillsCard editable={editable} />
        </div>
        <WorkingHoursCard editable={editable} />
      </div>
    </>
  );
}
