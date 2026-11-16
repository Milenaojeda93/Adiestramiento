'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Alert, Button, TextInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ kind: string; mustChangePassword: boolean }>('/auth/login', { method: 'POST', body: { email, password } });
      if (r.mustChangePassword) window.location.assign('/cambiar-clave');
      else window.location.assign(r.kind === 'PLATFORM_ADMIN' ? '/plataforma' : '/inicio');
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'No se pudo conectar. Revisá tu conexión.'));
    } finally {
      setLoading(false);
    }
  }

  const fe = error?.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-[400px] flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-bold">Ingresar</h1>
        <p className="text-[15px] text-muted">Usá el correo con el que te invitó tu centro.</p>
      </div>
      {error && !Object.keys(fe).length && <Alert tone="red">{error.message}</Alert>}
      <TextInput label="Correo electrónico" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fe.email} required />
      <TextInput
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fe.password}
        required
      />
      <Button type="submit" loading={loading} className="h-12 text-[15px]">
        Ingresar
      </Button>
      <p className="text-center text-sm text-muted">
        ¿Tenés un centro y querés probarlo?{' '}
        <Link href="/crear-cuenta" className="font-semibold text-brand hover:text-brand-dark">
          Crear cuenta con 14 días gratis
        </Link>
      </p>
    </form>
  );
}
