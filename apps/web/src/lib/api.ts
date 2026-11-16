'use client';

/** Error de la API con el formato único { code, message, details }. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  /** Errores de validación por campo: { firstName: 'Obligatorio' } */
  get fieldErrors(): Record<string, string> {
    if (this.code !== 'VALIDATION' || !Array.isArray(this.details)) return {};
    const out: Record<string, string> = {};
    // El primer mensaje de cada campo es el más relevante (ej. "mínimo 10 caracteres" antes que "usá letras y números").
    for (const d of this.details as { field: string; message: string }[]) out[d.field] ??= d.message;
    return out;
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.code ?? 'HTTP_ERROR', data.message ?? 'Ocurrió un error', data.details);
  }
  return data as T;
}

export const fetcher = <T,>(path: string) => api<T>(path);
