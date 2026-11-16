'use client';

import { useRouter } from 'next/navigation';
import { createContext, ReactNode, useContext, useEffect } from 'react';
import useSWR from 'swr';
import { ApiError, fetcher } from './api';
import type { Me } from './types';

const MeContext = createContext<{ me: Me; can: (p: string) => boolean; refresh: () => void } | null>(null);

/** Carga la sesión y redirige si no hay sesión, si falta cambiar la contraseña o si no hay empresa. */
export function MeProvider({ children, platform = false }: { children: ReactNode; platform?: boolean }) {
  const router = useRouter();
  const { data, error, mutate } = useSWR<Me, ApiError>('/auth/me', fetcher, { revalidateOnFocus: true });

  useEffect(() => {
    if (error?.status === 401) router.replace('/ingresar');
    if (!data) return;
    if (data.user.mustChangePassword) router.replace('/cambiar-clave');
    else if (platform && data.user.kind !== 'PLATFORM_ADMIN') router.replace('/inicio');
    else if (!platform && data.user.kind === 'PLATFORM_ADMIN' && !data.impersonating) router.replace('/plataforma');
  }, [data, error, router, platform]);

  if (error && error.status !== 401) {
    return <div className="p-10 text-center text-sm text-muted">No se pudo cargar tu sesión. {error.message}</div>;
  }
  if (!data || data.user.mustChangePassword) {
    return (
      <div className="flex min-h-screen items-center justify-center" aria-busy="true">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-r-transparent" aria-label="Cargando" />
      </div>
    );
  }
  const perms = new Set(data.permissions);
  return <MeContext.Provider value={{ me: data, can: (p) => perms.has(p), refresh: () => mutate() }}>{children}</MeContext.Provider>;
}

export function useMe() {
  const v = useContext(MeContext);
  if (!v) throw new Error('useMe fuera de MeProvider');
  return v;
}
