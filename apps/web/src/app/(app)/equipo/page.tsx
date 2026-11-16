'use client';

import { Plus } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Alert, Badge, Button, Card, Modal, PageHeader, Select, TextInput, cx } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useMe } from '@/lib/me';
import type { Role, TeamMember } from '@/lib/types';

interface Catalog {
  modules: Record<string, string>;
  actions: Record<string, string>;
}

function InviteForm({ roles, onDone, onCancel }: { roles: Role[]; onDone: (msg: string) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', roleId: roles.find((r) => r.key === 'trainer')?.id ?? roles[0]?.id ?? '', temporaryPassword: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api('/users', { method: 'POST', body: { ...form, branchIds: [] } });
      onDone(`${form.name} ya puede ingresar con ${form.email} y la contraseña temporal. Al entrar se le pedirá cambiarla.`);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setSaving(false);
    }
  }

  const fe = error?.fieldErrors ?? {};
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && !Object.keys(fe).length && <Alert tone={error.code === 'PLAN_LIMIT' ? 'amber' : 'red'}>{error.message}</Alert>}
      <TextInput label="Nombre y apellido" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={fe.name} />
      <TextInput label="Correo electrónico" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={fe.email} />
      <Select label="Rol" value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} options={roles.map((r) => ({ value: r.id, label: r.name }))} />
      <TextInput
        label="Contraseña temporal"
        type="text"
        autoComplete="off"
        value={form.temporaryPassword}
        onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })}
        error={fe.temporaryPassword}
        hint="Pasásela por un canal privado. Mínimo 10 caracteres con letras y números."
      />
      <Alert tone="blue">El envío de invitaciones por correo queda pendiente hasta configurar el servicio de correo.</Alert>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving}>
          Agregar al equipo
        </Button>
      </div>
    </form>
  );
}

function RoleForm({ catalog, role, onDone, onCancel }: { catalog: Catalog; role?: Role; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const toggle = (p: string) => {
    const next = new Set(perms);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setPerms(next);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(role ? `/roles/${role.id}` : '/roles', { method: role ? 'PATCH' : 'POST', body: { name, description: description || null, permissions: [...perms] } });
      onDone();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setSaving(false);
    }
  }

  const fe = error?.fieldErrors ?? {};
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && <Alert tone="red">{fe.permissions ?? error.message}</Alert>}
      <TextInput label="Nombre del rol" value={name} onChange={(e) => setName(e.target.value)} error={fe.name} />
      <TextInput label="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="overflow-x-auto rounded-[10px] border border-line">
        <table className="w-full min-w-[460px] text-sm">
          <caption className="sr-only">Permisos por módulo y acción</caption>
          <thead>
            <tr className="bg-[#fafaf8] text-xs text-muted">
              <th scope="col" className="px-3 py-2 text-left font-semibold">Módulo</th>
              {Object.entries(catalog.actions).map(([k, l]) => (
                <th key={k} scope="col" className="px-1 py-2 font-semibold">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(catalog.modules).map(([m, ml]) => (
              <tr key={m} className="border-t border-line-soft">
                <th scope="row" className="px-3 py-1.5 text-left font-medium">
                  {ml}
                </th>
                {Object.keys(catalog.actions).map((a) => {
                  const p = `${m}:${a}`;
                  return (
                    <td key={a} className="text-center">
                      <input type="checkbox" aria-label={`${ml}: ${catalog.actions[a]}`} checked={perms.has(p)} onChange={() => toggle(p)} className="h-[18px] w-[18px] accent-brand" />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving}>
          {role ? 'Guardar rol' : 'Crear rol'}
        </Button>
      </div>
    </form>
  );
}

export default function EquipoPage() {
  const { can, me } = useMe();
  const ro = me.organization?.readOnly;
  const { data: team, mutate: refreshTeam } = useSWR<TeamMember[]>('/users', fetcher);
  const { data: roles, mutate: refreshRoles } = useSWR<Role[]>(can('roles:read') ? '/roles' : null, fetcher);
  const { data: catalog } = useSWR<Catalog>(can('roles:read') ? '/roles/catalog' : null, fetcher);
  const [tab, setTab] = useState<'team' | 'roles'>('team');
  const [invite, setInvite] = useState(false);
  const [roleModal, setRoleModal] = useState<null | { role?: Role }>(null);
  const [notice, setNotice] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  const roleOptions = useMemo(() => (roles ?? []).map((r) => ({ value: r.id, label: r.name })), [roles]);

  async function updateMember(m: TeamMember, patch: { roleId?: string; active?: boolean }) {
    try {
      await api(`/users/${m.membershipId}`, { method: 'PATCH', body: patch });
      setNotice({ tone: 'green', text: 'Cambio guardado.' });
      refreshTeam();
    } catch (err) {
      setNotice({ tone: 'red', text: (err as ApiError).message });
    }
  }

  return (
    <>
      <PageHeader
        title="Equipo y roles"
        actions={
          !ro && tab === 'team' && can('users:create') && roles ? (
            <Button onClick={() => setInvite(true)}>
              <Plus size={16} aria-hidden /> Agregar persona
            </Button>
          ) : !ro && tab === 'roles' && can('roles:create') ? (
            <Button onClick={() => setRoleModal({})}>
              <Plus size={16} aria-hidden /> Nuevo rol
            </Button>
          ) : null
        }
      />
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      {can('roles:read') && (
        <div role="tablist" className="flex gap-1 border-b border-line">
          {(
            [
              ['team', 'Personas'],
              ['roles', 'Roles y permisos'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cx('-mb-px min-h-11 border-b-2 px-3.5 text-sm', tab === k ? 'border-brand font-semibold text-brand-dark' : 'border-transparent font-medium text-muted')}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {tab === 'team' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="bg-[#fafaf8] text-left text-xs text-muted">
                  <th scope="col" className="px-4 py-2.5 font-semibold">Persona</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">Rol</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">Último ingreso</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">Estado</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {(team ?? []).map((m) => {
                  const isMe = m.userId === me.user.id;
                  const editable = can('users:update') && !ro && !isMe;
                  return (
                    <tr key={m.membershipId} className="border-t border-line-soft">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-semibold">
                            {m.name} {isMe && <span className="font-normal text-muted">(vos)</span>}
                          </span>
                          <span className="text-xs text-muted">{m.email}</span>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        {editable && roleOptions.length ? (
                          <label className="sr-only" htmlFor={`rol-${m.membershipId}`}>
                            Rol de {m.name}
                          </label>
                        ) : null}
                        {editable && roleOptions.length ? (
                          <select
                            id={`rol-${m.membershipId}`}
                            value={m.role.id}
                            onChange={(e) => updateMember(m, { roleId: e.target.value })}
                            className="h-9 rounded-lg border border-line bg-white px-2 text-sm"
                          >
                            {roleOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          m.role.name
                        )}
                      </td>
                      <td className="px-2 py-3 text-[#44403c]">{m.lastLoginAt ? fmtDateTime(m.lastLoginAt) : 'Nunca'}</td>
                      <td className="px-2 py-3">{m.active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                      <td className="px-4 py-3 text-right">
                        {editable && (
                          <Button variant="ghost" className="h-9 px-3 text-[13px] text-muted" onClick={() => updateMember(m, { active: !m.active })}>
                            {m.active ? 'Desactivar' : 'Reactivar'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'roles' && roles && (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          {roles.map((r) => (
            <Card key={r.id} className="flex flex-col gap-2 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">{r.name}</h2>
                {r.isSystem ? <Badge>Base</Badge> : <Badge tone="blue">Propio</Badge>}
              </div>
              {r.description && <p className="text-sm text-muted">{r.description}</p>}
              <span className="text-xs text-muted">
                {r.permissions.length} permisos{r.scopeOwn ? ' · solo sus registros asignados' : ''}
              </span>
              {r.key !== 'admin' && can('roles:update') && !ro && catalog && (
                <Button variant="secondary" className="mt-1 h-9 self-start text-[13px]" onClick={() => setRoleModal({ role: r })}>
                  Editar permisos
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={invite} onClose={() => setInvite(false)} title="Agregar persona al equipo">
        {invite && roles && (
          <InviteForm
            roles={roles}
            onCancel={() => setInvite(false)}
            onDone={(msg) => {
              setInvite(false);
              setNotice({ tone: 'green', text: msg });
              refreshTeam();
            }}
          />
        )}
      </Modal>

      <Modal open={!!roleModal} onClose={() => setRoleModal(null)} title={roleModal?.role ? `Rol: ${roleModal.role.name}` : 'Nuevo rol'}>
        {roleModal && catalog && (
          <RoleForm
            catalog={catalog}
            role={roleModal.role}
            onCancel={() => setRoleModal(null)}
            onDone={() => {
              setRoleModal(null);
              setNotice({ tone: 'green', text: 'Rol guardado.' });
              refreshRoles();
            }}
          />
        )}
      </Modal>
    </>
  );
}
