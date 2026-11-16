'use client';

import { MessageCircle, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import { Alert, Badge, Button, Card, EmptyState, Modal, PageHeader, TextArea, TextInput, cx } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { useMe } from '@/lib/me';
import type { Client, Page } from '@/lib/types';

const EMPTY = { firstName: '', lastName: '', documentId: '', phone: '', whatsapp: '', email: '', city: '', address: '', notes: '' };
type Form = typeof EMPTY;

function toForm(c: Client): Form {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    documentId: c.documentId ?? '',
    phone: c.phone,
    whatsapp: c.whatsapp ?? '',
    email: c.email ?? '',
    city: c.city ?? '',
    address: c.address ?? '',
    notes: c.notes ?? '',
  };
}

/** Link de WhatsApp: números locales 09xx se convierten a +595 9xx. */
function waLink(n: string) {
  const d = n.replace(/\D/g, '');
  const intl = d.startsWith('0') ? '595' + d.slice(1) : d;
  return `https://wa.me/${intl}`;
}

function ClientForm({ initial, onSaved, onCancel, editingId }: { initial: Form; onSaved: () => void; onCancel: () => void; editingId?: string }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      ...form,
      documentId: form.documentId || null,
      whatsapp: form.whatsapp || null,
      email: form.email || null,
      city: form.city || null,
      address: form.address || null,
      notes: form.notes || null,
    };
    try {
      await api(editingId ? `/clients/${editingId}` : '/clients', { method: editingId ? 'PATCH' : 'POST', body });
      onSaved();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setSaving(false);
    }
  }

  const fe = error?.fieldErrors ?? {};
  return (
    <form id="client-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && !Object.keys(fe).length && (
        <Alert tone="red">{error.code === 'DUPLICATE' ? 'Ya existe un cliente con ese documento.' : error.message}</Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Nombre" value={form.firstName} onChange={set('firstName')} error={fe.firstName} autoComplete="off" />
        <TextInput label="Apellido" value={form.lastName} onChange={set('lastName')} error={fe.lastName} autoComplete="off" />
        <TextInput label="Documento (CI o RUC)" value={form.documentId} onChange={set('documentId')} error={fe.documentId} />
        <TextInput label="Teléfono" type="tel" value={form.phone} onChange={set('phone')} error={fe.phone} placeholder="0981 123 456" />
        <TextInput label="WhatsApp" type="tel" value={form.whatsapp} onChange={set('whatsapp')} error={fe.whatsapp} hint="Si lo dejás vacío, se usa el teléfono." />
        <TextInput label="Correo electrónico" type="email" value={form.email} onChange={set('email')} error={fe.email} />
        <TextInput label="Ciudad" value={form.city} onChange={set('city')} error={fe.city} />
        <TextInput label="Dirección" value={form.address} onChange={set('address')} error={fe.address} />
      </div>
      <TextArea label="Observaciones" value={form.notes} onChange={set('notes')} error={fe.notes} rows={3} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving}>
          {editingId ? 'Guardar cambios' : 'Registrar cliente'}
        </Button>
      </div>
    </form>
  );
}

function ClientesInner() {
  const { can, me } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [term, setTerm] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | 'ALL'>('ACTIVE');
  const [modal, setModal] = useState<null | { mode: 'new' } | { mode: 'edit'; client: Client }>(params.get('nuevo') ? { mode: 'new' } : null);
  const [notice, setNotice] = useState<string | null>(null);
  const ro = me.organization?.readOnly;

  useEffect(() => {
    const q = params.get('q') ?? '';
    setSearch(q);
    setTerm(q);
  }, [params]);

  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const key = (i: number, prev: Page<Client> | null) => {
    if (prev && !prev.nextCursor) return null;
    const qs = new URLSearchParams({ status, limit: '25' });
    if (term) qs.set('search', term);
    if (prev?.nextCursor) qs.set('cursor', prev.nextCursor);
    return `/clients?${qs}`;
  };
  const { data, size, setSize, mutate, isLoading, error } = useSWRInfinite<Page<Client>>(key, fetcher);
  const items = data?.flatMap((p) => p.items) ?? [];
  const total = data?.[0]?.total ?? 0;
  const hasMore = !!data?.[data.length - 1]?.nextCursor;

  const close = () => {
    setModal(null);
    if (params.get('nuevo')) router.replace('/clientes');
  };

  async function toggleStatus(c: Client) {
    const next = c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await api(`/clients/${c.id}`, { method: 'PATCH', body: { status: next } });
      setNotice(next === 'INACTIVE' ? `${c.firstName} ${c.lastName} quedó desactivado. Su historial se conserva.` : `${c.firstName} ${c.lastName} está activo de nuevo.`);
      mutate();
    } catch (err) {
      setNotice((err as ApiError).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Propietarios"
        subtitle="Clientes y responsables de mascotas"
        actions={
          can('clients:create') && !ro ? (
            <Button onClick={() => setModal({ mode: 'new' })}>
              <Plus size={16} aria-hidden /> Nuevo cliente
            </Button>
          ) : null
        }
      />

      {notice && (
        <Alert tone="green">
          {notice}{' '}
          <button className="ml-2 font-semibold underline" onClick={() => setNotice(null)}>
            Cerrar
          </button>
        </Alert>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3.5">
          <label htmlFor="buscar-clientes" className="sr-only">
            Buscar
          </label>
          <input
            id="buscar-clientes"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, documento o teléfono"
            className="h-10 min-w-0 flex-[1_1_240px] rounded-[10px] border border-line px-3 text-sm"
          />
          <div role="group" aria-label="Estado" className="flex rounded-[10px] bg-[#eceae6] p-[3px]">
            {(
              [
                ['ACTIVE', 'Activos'],
                ['INACTIVE', 'Inactivos'],
                ['ALL', 'Todos'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={status === v}
                onClick={() => setStatus(v)}
                className={cx('h-[34px] rounded-lg px-3.5 text-sm', status === v ? 'bg-white font-semibold' : 'text-[#44403c]')}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="p-6">
            <Alert tone="red">{error.message}</Alert>
          </div>
        ) : isLoading ? (
          <div className="p-10 text-center text-sm text-muted">Cargando…</div>
        ) : items.length === 0 ? (
          term ? (
            <EmptyState title="Sin resultados">No encontramos clientes que coincidan con “{term}”.</EmptyState>
          ) : (
            <EmptyState
              title="Todavía no hay clientes"
              action={
                can('clients:create') && !ro ? (
                  <Button onClick={() => setModal({ mode: 'new' })}>
                    <Plus size={16} aria-hidden /> Registrar el primero
                  </Button>
                ) : null
              }
            >
              Registrá a los propietarios para después sumar sus mascotas y programas.
            </EmptyState>
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="bg-[#fafaf8] text-left text-xs text-muted">
                    <th scope="col" className="px-4 py-2.5 font-semibold">Nombre</th>
                    <th scope="col" className="px-2 py-2.5 font-semibold">Documento</th>
                    <th scope="col" className="px-2 py-2.5 font-semibold">Contacto</th>
                    <th scope="col" className="px-2 py-2.5 font-semibold">Ciudad</th>
                    <th scope="col" className="px-2 py-2.5 font-semibold">Alta</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id} className="border-t border-line-soft">
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/clientes/${c.id}`} className="font-semibold text-brand hover:text-brand-dark">
                            {c.firstName} {c.lastName}
                          </Link>
                          {c.status === 'INACTIVE' && <Badge>Inactivo</Badge>}
                          {c.isDemo && <Badge tone="blue">Demo</Badge>}
                        </div>
                        {c.email && <span className="text-xs text-muted">{c.email}</span>}
                      </td>
                      <td className="px-2 py-3 text-[#44403c]">{c.documentId ?? '—'}</td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[#44403c]">{c.phone}</span>
                          {c.whatsapp && (
                            <a href={waLink(c.whatsapp)} target="_blank" rel="noopener noreferrer" aria-label={`Abrir WhatsApp de ${c.firstName}`} className="text-brand hover:text-brand-dark">
                              <MessageCircle size={16} aria-hidden />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-[#44403c]">{c.city ?? '—'}</td>
                      <td className="px-2 py-3 text-[#44403c]">{fmtDate(c.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {can('clients:update') && !ro && (
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" className="h-9 px-3 text-[13px]" onClick={() => setModal({ mode: 'edit', client: c })}>
                              Editar
                            </Button>
                            <Button variant="ghost" className="h-9 px-3 text-[13px] text-muted" onClick={() => toggleStatus(c)}>
                              {c.status === 'ACTIVE' ? 'Desactivar' : 'Reactivar'}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[13px] text-muted">
              <span>
                {items.length} de {total} {total === 1 ? 'cliente' : 'clientes'}
              </span>
              {hasMore && (
                <Button variant="secondary" className="h-9 text-[13px]" onClick={() => setSize(size + 1)}>
                  Cargar más
                </Button>
              )}
            </div>
          </>
        )}
      </Card>

      <Modal open={!!modal} onClose={close} title={modal?.mode === 'edit' ? 'Editar cliente' : 'Nuevo cliente'}>
        {modal && (
          <ClientForm
            key={modal.mode === 'edit' ? modal.client.id : 'new'}
            initial={modal.mode === 'edit' ? toForm(modal.client) : EMPTY}
            editingId={modal.mode === 'edit' ? modal.client.id : undefined}
            onCancel={close}
            onSaved={() => {
              setNotice(modal.mode === 'edit' ? 'Cambios guardados.' : 'Cliente registrado.');
              close();
              mutate();
            }}
          />
        )}
      </Modal>
    </>
  );
}

export default function ClientesPage() {
  return (
    <Suspense>
      <ClientesInner />
    </Suspense>
  );
}
