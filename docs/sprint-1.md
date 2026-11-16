# Sprint 1 · Cimientos

## Qué funciona

| Área | Funcionalidad |
| --- | --- |
| Alta de empresa | Registro con 14 días de prueba del Plan Profesional. Crea empresa, sucursal principal, 4 roles base y el administrador. |
| Sesión | Ingreso, salida, cambio de contraseña, contraseña temporal obligatoria de cambiar, bloqueo tras 5 intentos, límite de intentos por minuto. |
| Multiempresa | Aislamiento por RLS en PostgreSQL, cambio de empresa activa para usuarios en más de una. |
| Equipo y roles | Alta de personas con rol, cambio de rol, desactivar/reactivar, roles propios con matriz de permisos. Límite de entrenadores según el plan. |
| Clientes | Alta, edición, desactivar/reactivar (conserva historial), búsqueda por nombre, documento o teléfono, paginación, link directo a WhatsApp, documento único por empresa. |
| Configuración | Datos de la empresa (RUC con validación), plan y funciones incluidas, sucursales. |
| Auditoría | Registro inalterable de altas, ediciones, ingresos y acciones de la plataforma. |
| Plataforma | Métricas, empresas, cambio de plan, suspender/reactivar, registrar pago manual, modo soporte de solo lectura con motivo auditado. |

## Pendiente para próximos sprints

- El rol Entrenador verá solo los clientes de sus mascotas asignadas cuando existan mascotas y programas (Sprint 2).
- Invitación por correo con link: hoy se usa contraseña temporal, porque el correo aún no está configurado.
- Gestión de sucursales (alta y edición) y restricción por sucursal en las consultas: llega con la agenda.
- Portal del propietario (PWA): fase 2.

## Próximo: Sprint 2 · Mascotas

Ficha de mascota con sus 9 pestañas, salud y conducta, varios responsables por mascota, fotos en almacenamiento privado y la ficha consolidada del cliente.
