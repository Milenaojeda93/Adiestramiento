'use client';

import { PROGRAM_STATUS_LABELS, SESSION_STATUS_LABELS } from '@adiestra/shared';
import { AlertTriangle } from 'lucide-react';
import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import { Badge, cx, Field } from './ui';

/** Selector con búsqueda contra la API (clientes, mascotas). */
export function SearchSelect<T extends { id: string }>({
  label,
  endpoint,
  value,
  onChange,
  render,
  placeholder,
  error,
  initialLabel,
}: {
  label: string;
  endpoint: (q: string) => string;
  value: string | null;
  onChange: (item: T | null) => void;
  render: (item: T) => string;
  placeholder?: string;
  error?: string;
  initialLabel?: string;
}) {
  const id = useId();
  const [q, setQ] = useState(initialLabel ?? '');
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const { data } = useSWR<{ items: T[] }>(open ? endpoint(debounced) : null, fetcher);
  return (
    <Field label={label} error={error} htmlFor={id}>
      <div ref={box} className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          value={q}
          placeholder={placeholder ?? 'Escribí para buscar'}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            if (value) onChange(null);
          }}
          className={cx('h-11 w-full rounded-[10px] border bg-white px-3 text-[15px]', error ? 'border-danger' : 'border-[#d6d3ce]')}
        />
        {open && (
          <ul role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-[10px] border border-line bg-white py-1 shadow-lg">
            {!data && <li className="px-3 py-2 text-sm text-muted">Buscando…</li>}
            {data?.items.length === 0 && <li className="px-3 py-2 text-sm text-muted">Sin resultados</li>}
            {data?.items.map((item) => (
              <li key={item.id} role="option" aria-selected={item.id === value}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-ground"
                  onClick={() => {
                    onChange(item);
                    setQ(render(item));
                    setOpen(false);
                  }}
                >
                  {render(item)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}

export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: [K, string][]; value: K; onChange: (k: K) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map(([k, l]) => (
        <button
          key={k}
          role="tab"
          aria-selected={value === k}
          onClick={() => onChange(k)}
          className={cx('-mb-px min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3.5 text-sm', value === k ? 'border-brand font-semibold text-brand-dark' : 'border-transparent font-medium text-muted')}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

const SESSION_TONES = { SCHEDULED: 'blue', CONFIRMED: 'green', DONE: 'gray', CANCELLED: 'red', NO_SHOW: 'amber' } as const;
export function SessionBadge({ status }: { status: keyof typeof SESSION_STATUS_LABELS }) {
  return <Badge tone={SESSION_TONES[status]}>{SESSION_STATUS_LABELS[status]}</Badge>;
}

const PROGRAM_TONES = { PENDING: 'blue', ACTIVE: 'green', PAUSED: 'amber', FINISHED: 'gray', CANCELLED: 'red' } as const;
export function ProgramBadge({ status }: { status: keyof typeof PROGRAM_STATUS_LABELS }) {
  return <Badge tone={PROGRAM_TONES[status]}>{PROGRAM_STATUS_LABELS[status]}</Badge>;
}

export function PetAlerts({ alerts, small }: { alerts: string[]; small?: boolean }) {
  if (!alerts?.length) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {alerts.map((a) => (
        <span key={a} className={cx('inline-flex items-center gap-1 rounded-md bg-danger-soft font-semibold text-danger-ink', small ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs')}>
          <AlertTriangle size={small ? 11 : 13} aria-hidden /> {a}
        </span>
      ))}
    </span>
  );
}

/** Barra de progreso de un paquete: realizadas sobre contratadas. */
export function PackageBar({ done, total, balance }: { done: number; total: number; balance: number }) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm">
        <span>
          {done} de {total} realizadas
        </span>
        <span className={cx('font-semibold', balance <= 0 ? 'text-danger-ink' : balance <= 2 ? 'text-warn-ink' : '')}>
          {balance} {balance === 1 ? 'disponible' : 'disponibles'}
        </span>
      </div>
      <div className="h-2 rounded bg-line-soft">
        <div className="h-2 rounded bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
      {items.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="whitespace-pre-line text-sm">{v || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Escala 1–5 táctil, con el valor anterior como referencia. */
export function RatingPicker({ label, value, previous, onChange }: { label: string; value: number | null; previous?: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        {previous != null && <span className="text-xs text-muted">Antes: {previous}</span>}
      </div>
      <div role="group" aria-label={label} className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(value === v ? null : v)}
            className={cx('h-11 rounded-[10px] text-[15px]', value === v ? 'bg-brand font-bold text-white' : 'border border-line bg-white')}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
