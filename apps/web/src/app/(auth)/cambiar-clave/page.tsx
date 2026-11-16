'use client';

import { FormEvent, useState } from 'react';
import { Alert, Button, TextInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError(new ApiError(400, 'VALIDATION', 'Las contraseñas no coinciden', [{ field: 'confirm', message: 'Las contraseñas no coinciden' }]));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      window.location.assign('/inicio');
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'No se pudo conectar.'));
    } finally {
      setLoading(false);
    }
  }

  const fe = error?.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-[400px] flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-bold">Elegí tu contraseña</h1>
        <p className="text-[15px] text-muted">Reemplazá la contraseña temporal que te dieron por una propia.</p>
      </div>
      {error && !Object.keys(fe).length && <Alert tone="red">{error.message}</Alert>}
      <TextInput label="Contraseña temporal o actual" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} error={fe.currentPassword} />
      <TextInput label="Nueva contraseña" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} error={fe.newPassword} hint="Mínimo 10 caracteres, con letras y números." />
      <TextInput label="Repetí la nueva contraseña" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={fe.confirm} />
      <Button type="submit" loading={loading} className="h-12 text-[15px]">
        Guardar y continuar
      </Button>
    </form>
  );
}
