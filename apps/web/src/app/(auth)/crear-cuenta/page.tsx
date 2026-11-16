'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Alert, Button, TextInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function SignupPage() {
  const [form, setForm] = useState({ organizationName: '', ownerName: '', email: '', phone: '', password: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/auth/signup', { method: 'POST', body: { ...form, phone: form.phone || undefined } });
      window.location.assign('/inicio');
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'No se pudo conectar. Revisá tu conexión.'));
    } finally {
      setLoading(false);
    }
  }

  const fe = error?.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-[420px] flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-bold">Creá la cuenta de tu centro</h1>
        <p className="text-[15px] text-muted">14 días de prueba con todas las funciones del Plan Profesional. Sin tarjeta.</p>
      </div>
      {error && !Object.keys(fe).length && <Alert tone="red">{error.message}</Alert>}
      <TextInput label="Nombre del centro o marca" value={form.organizationName} onChange={set('organizationName')} error={fe.organizationName} placeholder="Centro Canino Ñu Guasu" />
      <TextInput label="Tu nombre" autoComplete="name" value={form.ownerName} onChange={set('ownerName')} error={fe.ownerName} />
      <TextInput label="Correo electrónico" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={fe.email} />
      <TextInput label="Teléfono o WhatsApp (opcional)" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} error={fe.phone} placeholder="0981 123 456" />
      <TextInput
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        value={form.password}
        onChange={set('password')}
        error={fe.password}
        hint="Mínimo 10 caracteres, con letras y números."
      />
      <Button type="submit" loading={loading} className="mt-1 h-12 text-[15px]">
        Crear cuenta
      </Button>
      <p className="text-center text-sm text-muted">
        ¿Ya tenés cuenta?{' '}
        <Link href="/ingresar" className="font-semibold text-brand hover:text-brand-dark">
          Ingresar
        </Link>
      </p>
    </form>
  );
}
