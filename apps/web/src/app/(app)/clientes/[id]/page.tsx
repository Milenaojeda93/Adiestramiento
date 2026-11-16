'use client';

import { formatMoney } from '@adiestra/shared';
import { MessageCircle, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { NewPetForm, PaymentForm } from '@/components/forms';
import { PawIcon } from '@/components/logo';
import { Alert, Badge, Button, Card, Modal } from '@/components/ui';
import { KeyValue, PackageBar, PetAlerts, ProgramBadge } from '@/components/widgets';
import { fetcher } from '@/lib/api';
import { age, fmtDate, fmtIsoDate, todayIso, waLink } from '@/lib/format';
import { useMe } from '@/lib/me';
import type { Client, Page, PetListItem, ProgramListItem } from '@/lib/types';

interface Account {
  charges: { id: string; concept: string; amount: number; discount: number; dueDate: string; cancelled: boolean; paid: number; balance: number }[];
  payments: { id: string; receiptNumber: number; amount: number; method: string; paidAt: string; voided: boolean; reference: string | null }[];
  balance: number;
  overdue: number;
}

export default function ClientePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, me } = useMe();
  const ro = me.organization?.readOnly;
  const { data: client, error } = useSWR<Client>(`/clients/${id}`, fetcher);
  const { data: pets, mutate: refreshPets } = useSWR<Page<PetListItem>>(can('pets:read') ? `/pets?clientId=${id}&status=ALL&limit=50` : null, fetcher);
  const { data: programs } = useSWR<ProgramListItem[]>(can('programs:read') ? `/programs?clientId=${id}` : null, fetcher);
  const { data: account, mutate: refreshAccount } = useSWR<Account>(can('finance:read') ? `/clients/${id}/account` : null, fetcher);
  const [modal, setModal] = useState<null | 'pet' | 'pay'>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (error) return <Alert tone="red">{error.message}</Alert>;
  if (!client) return <div className="p-10 text-center text-sm text-muted">Cargando…</div>;
  const name = `${client.firstName} ${client.lastName}`;
  const t = todayIso();

  return (
    <>
      <nav aria-label="Ruta" className="flex gap-1.5 text-[13px] text-muted">
        <Link href="/clientes" className="text-brand">
          Propietarios
        </Link>
        <span>/</span>
        <span>{name}</span>
      </nav>
      <Card className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="flex flex-wrap items-center gap-2 text-[26px] font-bold">
            {name} {client.status === 'INACTIVE' && <Badge>Inactivo</Badge>}
          </h1>
          <span className="text-sm text-muted">
            {[client.documentId && `CI ${client.documentId}`, client.phone, client.email, client.city].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(client.whatsapp || client.phone) && (
            <a href={waLink(client.whatsapp ?? client.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-line bg-white px-4 text-sm font-semibold">
              <MessageCircle size={16} aria-hidden /> WhatsApp
            </a>
          )}
          {account && account.balance > 0 && can('finance:create') && !ro && (
            <Button onClick={() => setModal('pay')}>Registrar pago</Button>
          )}
        </div>
      </Card>
      {notice && <Alert tone="green">{notice}</Alert>}

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Mascotas</h2>
            {can('pets:create') && !ro && (
              <Button variant="secondary" className="h-9 text-[13px]" onClick={() => setModal('pet')}>
                <Plus size={14} aria-hidden /> Mascota
              </Button>
            )}
          </div>
          {pets?.items.length === 0 && <p className="text-sm text-muted">Todavía no tiene mascotas registradas.</p>}
          {pets?.items.map((p) => (
            <Link key={p.id} href={`/mascotas/${p.id}`} className="flex items-center gap-3 rounded-[10px] border border-line-soft p-3 hover:bg-ground">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <PawIcon size={18} />
              </span>
              <span className="flex flex-1 flex-col">
                <span className="font-semibold">{p.name}</span>
                <span className="text-xs text-muted">{[p.breed ?? p.species, age(p.birthDate)].filter(Boolean).join(' · ')}</span>
              </span>
              <PetAlerts alerts={p.alerts} small />
            </Link>
          ))}
        </Card>

        {account && (
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-base font-semibold">Cuenta</h2>
            <div className="flex flex-wrap gap-6">
              <div className="flex flex-col">
                <span className="text-xs text-muted">Saldo pendiente</span>
                <span className="text-xl font-bold">{formatMoney(account.balance)}</span>
              </div>
              {account.overdue > 0 && (
                <div className="flex flex-col">
                  <span className="text-xs text-danger-ink">Vencido</span>
                  <span className="text-xl font-bold text-danger-ink">{formatMoney(account.overdue)}</span>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1.5 font-semibold">Concepto</th>
                    <th className="py-1.5 font-semibold">Vence</th>
                    <th className="py-1.5 text-right font-semibold">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {account.charges
                    .filter((c) => !c.cancelled)
                    .map((c) => (
                      <tr key={c.id} className="border-t border-line-soft">
                        <td className="py-2">{c.concept}</td>
                        <td className={`py-2 ${c.balance > 0 && c.dueDate < t ? 'font-semibold text-danger-ink' : ''}`}>{fmtIsoDate(c.dueDate)}</td>
                        <td className="py-2 text-right">{c.balance === 0 ? <Badge tone="green">Pagado</Badge> : formatMoney(c.balance)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {account.payments.length > 0 && (
              <>
                <h3 className="mt-2 text-sm font-semibold">Pagos</h3>
                {account.payments.map((p) => (
                  <Link key={p.id} href={`/recibos/${p.id}`} className="flex justify-between border-t border-line-soft pt-2 text-sm hover:text-brand">
                    <span>
                      Recibo N.º {String(p.receiptNumber).padStart(6, '0')} · {fmtIsoDate(p.paidAt)} {p.voided && <Badge tone="red">Anulado</Badge>}
                    </span>
                    <span className={p.voided ? 'text-muted line-through' : 'font-semibold'}>{formatMoney(p.amount)}</span>
                  </Link>
                ))}
              </>
            )}
          </Card>
        )}
      </div>

      {programs && programs.length > 0 && (
        <Card>
          <h2 className="px-5 pt-5 text-base font-semibold">Programas contratados</h2>
          <ul className="divide-y divide-line-soft">
            {programs.map((p) => (
              <li key={p.id}>
                <Link href={`/programas/${p.id}`} className="grid gap-3 px-5 py-4 hover:bg-ground sm:grid-cols-[1fr_260px]">
                  <span className="flex flex-col gap-1">
                    <span className="flex items-center gap-2 font-semibold">
                      {p.pet.name} · {p.service.name} <ProgramBadge status={p.status} />
                    </span>
                    <span className="text-xs text-muted">
                      {p.trainer?.name} · desde el {fmtIsoDate(p.startDate)}
                    </span>
                  </span>
                  <PackageBar done={p.done} total={p.sessionsContracted} balance={p.balance} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold">Datos de contacto</h2>
        <KeyValue
          items={[
            ['Documento', client.documentId],
            ['Teléfono', client.phone],
            ['WhatsApp', client.whatsapp],
            ['Correo', client.email],
            ['Dirección', client.address],
            ['Ciudad', client.city],
            ['Cliente desde', fmtDate(client.createdAt)],
            ['Observaciones', client.notes],
          ]}
        />
      </Card>

      <Modal open={modal === 'pet'} onClose={() => setModal(null)} title="Nueva mascota">
        {modal === 'pet' && <NewPetForm ownerId={client.id} ownerLabel={name} onCancel={() => setModal(null)} onDone={() => { setModal(null); refreshPets(); }} />}
      </Modal>
      <Modal open={modal === 'pay'} onClose={() => setModal(null)} title="Registrar pago">
        {modal === 'pay' && account && (
          <PaymentForm
            clientId={client.id}
            clientName={name}
            debt={account.balance}
            onCancel={() => setModal(null)}
            onDone={(pid) => {
              setModal(null);
              setNotice('Pago registrado.');
              refreshAccount();
              refreshPets();
              router.push(`/recibos/${pid}`);
            }}
          />
        )}
      </Modal>
    </>
  );
}
