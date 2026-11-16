'use client';

import { formatMoney, PAYMENT_METHOD_LABELS } from '@adiestra/shared';
import { Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Alert, Button, Card } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';
import { fmtIsoDate } from '@/lib/format';
import { useMe } from '@/lib/me';
import { useState } from 'react';

interface Receipt {
  id: string;
  receiptNumber: number;
  amount: number;
  method: keyof typeof PAYMENT_METHOD_LABELS;
  paidAt: string;
  reference: string | null;
  notes: string | null;
  voided: boolean;
  cashier: string | null;
  client: { id: string; firstName: string; lastName: string; documentId: string | null; phone: string };
  organization: { name: string; legalName: string | null; ruc: string | null; phone: string | null; address: string | null; email: string | null };
  lines: { concept: string; amount: number; dueDate: string }[];
}

/** Recibo interno imprimible. No es una factura legal. */
export default function ReciboPage() {
  const { id } = useParams<{ id: string }>();
  const { can, me } = useMe();
  const { data: r, mutate, error } = useSWR<Receipt>(`/payments/${id}/receipt`, fetcher);
  const [err, setErr] = useState<string | null>(null);
  if (error) return <Alert tone="red">{error.message}</Alert>;
  if (!r) return <div className="p-10 text-center text-sm text-muted">Cargando…</div>;
  const o = r.organization;

  async function voidIt() {
    const reason = window.prompt('Motivo de la anulación (queda en la auditoría):');
    if (!reason) return;
    try {
      await api(`/payments/${id}/void`, { method: 'POST', body: { reason } });
      mutate();
    } catch (e) {
      setErr((e as ApiError).message);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/clientes/${r.client.id}`} className="text-sm text-brand">
          ← {r.client.firstName} {r.client.lastName}
        </Link>
        <div className="flex gap-2">
          {!r.voided && can('finance:delete') && !me.organization?.readOnly && (
            <Button variant="danger" onClick={voidIt}>
              Anular pago
            </Button>
          )}
          <Button onClick={() => window.print()}>
            <Printer size={16} aria-hidden /> Imprimir o guardar PDF
          </Button>
        </div>
      </div>
      {err && <Alert tone="red">{err}</Alert>}
      <Card className="print-sheet mx-auto flex w-full max-w-[720px] flex-col gap-6 p-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div className="text-sm">
            <p className="text-lg font-bold">{o.name}</p>
            {o.legalName && <p>{o.legalName}</p>}
            {o.ruc && <p>RUC {o.ruc}</p>}
            <p className="text-muted">{[o.address, o.phone, o.email].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted">Recibo</p>
            <p className="text-xl font-bold">N.º {String(r.receiptNumber).padStart(6, '0')}</p>
            <p className="text-sm">{fmtIsoDate(r.paidAt)}</p>
          </div>
        </header>
        {r.voided && <Alert tone="red" title="Pago anulado.">{r.notes}</Alert>}
        <p className="text-sm">
          Recibimos de <strong>{r.client.firstName} {r.client.lastName}</strong>
          {r.client.documentId ? ` (CI ${r.client.documentId})` : ''} la suma de <strong>{formatMoney(r.amount)}</strong> en concepto de:
        </p>
        <table className="w-full text-sm">
          <tbody>
            {r.lines.map((l, i) => (
              <tr key={i} className="border-t border-line-soft">
                <td className="py-2">{l.concept}</td>
                <td className="py-2 text-right">{formatMoney(l.amount)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink">
              <td className="py-2 font-bold">Total</td>
              <td className="py-2 text-right font-bold">{formatMoney(r.amount)}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-sm">
          Forma de pago: {PAYMENT_METHOD_LABELS[r.method]}
          {r.reference ? ` · Ref. ${r.reference}` : ''}
          {r.cashier ? ` · Recibió: ${r.cashier}` : ''}
        </p>
        <footer className="border-t border-line pt-4 text-xs text-muted">Comprobante interno de pago. No válido como factura.</footer>
      </Card>
    </>
  );
}
