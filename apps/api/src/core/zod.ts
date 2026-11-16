import type { ZodTypeAny, z } from 'zod';

/** Valida y devuelve los datos tipados; el filtro global traduce el ZodError a 400. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data);
}
