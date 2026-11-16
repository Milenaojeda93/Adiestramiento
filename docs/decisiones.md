# Decisiones de arquitectura

Cada decisión con su motivo, para que quien continúe el proyecto no la deshaga sin querer.

## ADR-001 · Una base compartida con Row Level Security

**Decisión.** Todas las empresas comparten una base PostgreSQL. Cada tabla de negocio lleva `organization_id` y tiene una política RLS que solo deja ver y escribir filas de la empresa fijada en `app.org_id`.

**Cómo se usa.**
- La API tiene dos conexiones: `SYSTEM_DB` (rol dueño, sin RLS) y `APP_DB` (rol `adiestra_app`, con RLS).
- `SYSTEM_DB` solo se usa en login, alta de empresas, alta de usuarios y el panel de plataforma.
- Toda otra consulta pasa por `TenantService.run(ctx, fn)`, que abre una transacción y fija `app.org_id` con `set_config(..., true)`: el valor muere con la transacción, así una conexión reutilizada nunca arrastra la empresa anterior.
- La empresa activa sale siempre de la sesión del servidor, nunca de un parámetro del navegador.

**Por qué.** Es lo más barato de operar con muchas empresas chicas, y un error de programación (un `where` olvidado) no filtra datos: la base lo impide. Las pruebas en `apps/api/test` lo verifican en la API y directo en SQL.

**Al agregar una tabla nueva por empresa:** agregarla a la migración de RLS (patrón de `drizzle/0001_rls.sql`) y sumar un caso a la suite de aislamiento.

## ADR-002 · Drizzle ORM en lugar de Prisma

**Decisión.** Se usa Drizzle ORM. El análisis original proponía Prisma.

**Por qué.** Prisma necesita descargar binarios propios desde un dominio que el entorno de desarrollo inicial tenía bloqueado. Drizzle es TypeScript puro, genera migraciones en SQL legible (necesario para escribir las políticas RLS a mano) y maneja transacciones con `set_config` sin trucos. Si se prefiere volver a Prisma, el esquema está en un solo archivo (`packages/db/src/schema.ts`) y las políticas RLS no dependen del ORM.

## ADR-003 · Sesiones de servidor con cookie, no JWT

**Decisión.** Al iniciar sesión se crea un token aleatorio de 32 bytes. El navegador lo guarda en una cookie `httpOnly`, `SameSite=Lax`; la base guarda solo su hash SHA-256.

**Por qué.** Se puede revocar al instante (cerrar sesión, desactivar un usuario, suspender una empresa), y cambiar de empresa activa es actualizar una fila. Las contraseñas usan argon2id con parámetros de OWASP. Tras 5 intentos fallidos la cuenta se bloquea 15 minutos.

**CSRF.** Toda operación que modifica datos verifica que el encabezado `Origin`, si viene, sea el de la web.

## ADR-004 · Web y API en el mismo origen

**Decisión.** Next.js reenvía `/api/*` a la API. El navegador nunca habla con otro dominio.

**Por qué.** La cookie de sesión es de primera parte, no hace falta CORS y la protección por origen es simple.

## ADR-005 · Permisos "módulo:acción" evaluados solo en la API

**Decisión.** Cada rol tiene una lista de permisos como `clients:read` o `finance:create`. Los cinco roles base se crean con cada empresa y se pueden ajustar; el Administrador no se puede modificar y siempre debe quedar al menos uno activo.

**Por qué.** Granularidad suficiente para el pedido (permisos por módulo y por acción) sin un motor de políticas. El frontend usa los permisos solo para ocultar menús; la API es la que decide.

## ADR-006 · Planes como funciones con límites

**Decisión.** Un plan es un conjunto de funciones (`finance.enabled`, `trainers.max`, ...). La API consulta `FeaturesService` antes de operaciones de módulos opcionales o con límite.

**Por qué.** El panel de plataforma puede cambiar qué incluye cada plan sin tocar código. Una empresa con la suscripción vencida (más los días de gracia) o suspendida pasa a solo lectura: nunca se borran datos.

## ADR-007 · Integraciones honestas

**Decisión.** Correo, WhatsApp y pasarela de pago no se simulan. Mientras no tengan credenciales válidas, la interfaz las muestra como pendientes de configuración. Los pagos de suscripción se registran a mano desde el panel de plataforma y quedan auditados.

## ADR-008 · Portal del propietario como aplicación web instalable (PWA)

**Decisión.** El propietario no necesita una app de tienda. Recibe una invitación por link (WhatsApp o correo), crea su contraseña una vez y puede agregar el portal a la pantalla de inicio de su celular.

**Por qué.** Sin costos ni demoras de publicación en tiendas, y cada mejora llega a todos al instante. Las notificaciones push funcionan en Android y en iPhone solo si el portal está instalado; por eso los avisos importantes también saldrán por WhatsApp cuando esté configurado. Para compartir un informe o certificado puntual con alguien sin cuenta habrá links de solo lectura con vencimiento y revocables. Se construye en la fase 2.

## ADR-009 · Dinero en enteros

**Decisión.** Los montos se guardan como enteros en la unidad mínima de la moneda. En PYG, que no tiene decimales, 350000 son Gs. 350.000.
