# Adiestra

Plataforma SaaS multiempresa para adiestradores y centros de entrenamiento de mascotas. Español, guaraníes (PYG) por defecto.

**Estado: Sprint 1 (cimientos) terminado.** Incluye alta de empresas con prueba gratuita, inicio de sesión, equipo, roles y permisos, auditoría, el módulo de clientes completo y el panel de plataforma. Detalle en [docs/sprint-1.md](docs/sprint-1.md).

## Estructura

```
apps/
  api/        API REST (NestJS) en /api/v1
  web/        Web (Next.js + Tailwind): equipo del centro y panel de plataforma
packages/
  db/         Esquema (Drizzle ORM), migraciones SQL, Row Level Security, seed
  shared/     Validaciones (zod), catálogo de permisos y utilidades de moneda, compartidos por API y web
infra/        PostgreSQL local con Docker y script de roles
docs/         Decisiones de arquitectura (ADR) y notas de cada sprint
```

## Requisitos

- Node.js 22 o superior
- pnpm 10 (`corepack enable`)
- PostgreSQL 16 (local o con Docker)

## Puesta en marcha

1. **Base de datos.** Con Docker:

   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```

   Sin Docker, ejecutá `infra/init-roles.sql` como superusuario en tu PostgreSQL. Crea dos roles:
   `adiestra_owner` (dueño de las tablas) y `adiestra_app` (rol de la aplicación, sujeto a Row Level Security).

2. **Dependencias y variables de entorno.**

   ```bash
   pnpm install
   cp apps/api/.env.example apps/api/.env
   cp packages/db/.env.example packages/db/.env
   ```

3. **Migraciones y datos iniciales.**

   ```bash
   pnpm db:migrate        # tablas + políticas RLS
   pnpm db:seed           # planes, funciones y superadministrador
   pnpm db:seed:demo      # opcional: empresa de demostración con clientes marcados "Demo"
   ```

4. **Levantar todo.**

   ```bash
   pnpm dev
   ```

   - Web: http://localhost:3000
   - API: http://localhost:4000/api/v1 (la web la usa a través de `/api`, mismo origen)

### Usuarios de desarrollo

| Para qué | Correo | Contraseña |
| --- | --- | --- |
| Panel de plataforma | admin@adiestra.local | Plataforma2026 |
| Empresa demo (tras `db:seed:demo`) | demo@adiestra.local | Demo12345678 |

También podés crear una empresa nueva desde http://localhost:3000/crear-cuenta.

## Pruebas

```bash
pnpm test
```

Usa una base separada (`adiestra_test`) que se recrea en cada corrida. Las 40 pruebas (19 de Sprint 1 + 21 de operación) cubren:

- **Aislamiento entre empresas:** listados, búsqueda, lectura/edición por id ajeno, `organizationId` falsificado, cambio de empresa, roles, usuarios y auditoría.
- **RLS directo en PostgreSQL:** sin empresa fijada no se ve nada; no se puede leer, editar ni insertar en otra empresa; la app no puede leer hashes de contraseña ni sesiones, ni borrar auditoría.
- **Permisos:** contraseña temporal obligatoria, alcance de cada rol, no quedarse sin administrador, bloqueo tras 5 intentos fallidos, protección CSRF por origen.
- **Operación (Sprints 2–6):** alcance del entrenador a sus mascotas, último responsable protegido, conflictos de agenda y horario laboral, consumo y reversión del paquete, política de ausencias, cuotas y pagos (imputación, sobrepago, anulación, numeración de recibos), y RLS en las 22 tablas de empresa.
- **Plataforma:** límite de entrenadores por plan, empresa suspendida en solo lectura, pago manual de suscripción, modo soporte auditado y de solo lectura.

## Variables de entorno de la API

| Variable | Para qué |
| --- | --- |
| `DATABASE_URL_OWNER` | Rol dueño. Solo login, alta de empresas y panel de plataforma. |
| `DATABASE_URL_APP` | Rol de la app, sujeto a RLS. Toda la operación de las empresas. |
| `WEB_ORIGIN` | Origen permitido para operaciones que modifican datos (CSRF). |
| `SESSION_DAYS` | Duración de la sesión (por defecto 7). |
| `GRACE_DAYS` | Días de gracia tras vencer prueba o pago antes de pasar a solo lectura (por defecto 5). |

## Producción: lo mínimo a revisar

- Servir la web por HTTPS (`NODE_ENV=production` activa la cookie `Secure`).
- Contraseñas fuertes para `adiestra_owner` y `adiestra_app`, guardadas como secretos.
- El límite de intentos usa la IP del cliente: el proxy delante de la API debe enviar `X-Forwarded-For`.
- Respaldo diario de PostgreSQL con recuperación a un punto en el tiempo, y prueba de restauración mensual.
- Integraciones pendientes de configuración (correo, WhatsApp, pasarela de pago): la app lo muestra así, sin simular envíos ni cobros.

## Decisiones técnicas

Ver [docs/decisiones.md](docs/decisiones.md).
