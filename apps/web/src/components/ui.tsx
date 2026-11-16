'use client';

import { X } from 'lucide-react';
import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes, useEffect, useId, useRef } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark border border-transparent',
  secondary: 'bg-white text-ink border border-line hover:bg-ground',
  ghost: 'bg-transparent text-ink border border-transparent hover:bg-line-soft',
  danger: 'bg-white text-danger-ink border border-danger/40 hover:bg-danger-soft',
};

export function Button({
  variant = 'primary',
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        'inline-flex h-11 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        className,
      )}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
      {children}
    </button>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <span className="text-xs font-medium text-danger-ink" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs text-muted">{hint}</span>
      ) : null}
    </div>
  );
}

const inputCls = (error?: string) =>
  cx(
    'h-11 w-full rounded-[10px] border bg-white px-3 text-[15px] text-ink placeholder:text-faint',
    error ? 'border-danger' : 'border-[#d6d3ce] focus:border-brand',
  );

export function TextInput({ label, error, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={id}>
      <input {...props} id={id} aria-invalid={!!error} className={inputCls(error)} />
    </Field>
  );
}

export function TextArea({ label, error, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <Field label={label} error={error} htmlFor={id}>
      <textarea {...props} id={id} aria-invalid={!!error} className={cx(inputCls(error), 'h-auto min-h-24 py-2.5 leading-relaxed')} />
    </Field>
  );
}

export function Select({
  label,
  error,
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; options: { value: string; label: string }[] }) {
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <Field label={label} error={error} htmlFor={id}>
      <select {...props} id={id} className={inputCls(error)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('rounded-[14px] border border-line bg-white', className)}>{children}</section>;
}

type Tone = 'green' | 'blue' | 'amber' | 'red' | 'gray';
const tones: Record<Tone, string> = {
  green: 'bg-brand-soft text-brand-dark',
  blue: 'bg-info-soft text-info-ink',
  amber: 'bg-warn-soft text-warn-ink',
  red: 'bg-danger-soft text-danger-ink',
  gray: 'bg-line-soft text-[#44403c]',
};
export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone])}>{children}</span>;
}

export function Alert({ tone = 'amber', title, children }: { tone?: 'amber' | 'red' | 'blue' | 'green'; title?: string; children?: ReactNode }) {
  const bg = { amber: 'bg-warn-soft', red: 'bg-danger-soft', blue: 'bg-info-soft', green: 'bg-brand-soft' }[tone];
  const ink = { amber: 'text-warn-ink', red: 'text-danger-ink', blue: 'text-info-ink', green: 'text-brand-dark' }[tone];
  return (
    <div role={tone === 'red' ? 'alert' : 'status'} className={cx('rounded-[10px] px-4 py-3 text-sm text-[#44403c]', bg)}>
      {title && <strong className={cx('font-semibold', ink)}>{title} </strong>}
      {children}
    </div>
  );
}

/** Ventana modal accesible: foco inicial, Escape para cerrar, clic fuera. */
export function Modal({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-line-soft">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-base font-semibold">{title}</p>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        {subtitle && <span className="text-[13px] text-muted">{subtitle}</span>}
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export { cx };
