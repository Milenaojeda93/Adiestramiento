import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';

/** Error de negocio con código estable para el frontend. */
export class AppError extends HttpException {
  constructor(status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super({ code, message, details }, status);
  }
}

export const notFound = (what = 'Registro') => new AppError(404, 'NOT_FOUND', `${what} no encontrado`);
export const forbidden = (message = 'No tenés permiso para esta acción') => new AppError(403, 'FORBIDDEN', message);

/** Formato único de error: { code, message, details }. Nunca expone detalles internos. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errores');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ZodError) {
      return res.status(400).json({
        code: 'VALIDATION',
        message: 'Revisá los datos ingresados',
        details: exception.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body && 'code' in body) return res.status(status).json(body);
      const code =
        status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR';
      const message =
        status === 429 ? 'Demasiados intentos. Esperá un momento.' : status === 404 ? 'Recurso no encontrado' : exception.message;
      return res.status(status).json({ code, message });
    }

    // Errores de PostgreSQL conocidos
    const pg = (exception as { cause?: { code?: string; constraint?: string } })?.cause ?? (exception as { code?: string; constraint?: string });
    if (pg?.code === '23505') {
      return res.status(409).json({ code: 'DUPLICATE', message: 'Ya existe un registro con esos datos', details: { constraint: pg.constraint } });
    }
    if (pg?.code === '42501') {
      this.logger.error('Acceso denegado por la base de datos (RLS/permisos)', exception as Error);
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Acceso denegado' });
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 'INTERNAL', message: 'Ocurrió un error inesperado' });
  }
}
