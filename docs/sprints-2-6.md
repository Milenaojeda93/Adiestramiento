# Sprints 2 a 6 — operación del centro

Publicado en https://adiestra.vercel.app (commits c0f93c4 y 351ba7a).

## Qué incluye
- **Mascotas:** ficha con pestañas (datos, salud y vacunas, conducta, responsables, evaluaciones, programas, sesiones, evolución). Varios responsables por mascota; no se puede quitar al último. Alertas visibles (vacuna vencida, conducta).
- **Evaluaciones:** evaluación inicial con escala por habilidad, imprimible. Habilidades configurables por empresa.
- **Servicios y programas:** catálogo de servicios; programa con paquete de sesiones (libro mayor: compra, consumo, reversión, ajuste, vencimiento) y cuotas generadas automáticamente.
- **Agenda:** vista semana y día por entrenador, horario laboral, ausencias, detección de choques con sugerencia de horarios libres, sesiones recurrentes, reprogramar, confirmar, cancelar (marca "tardía" según la política de horas).
- **Seguimiento de sesión:** registro con calificaciones por habilidad, notas y tareas para casa; consume del paquete; edición en 24 h y reversión.
- **Mi día:** sesiones del entrenador para hoy.
- **Cobros:** saldos por cliente, pagos con imputación a la cuota más antigua, recibos numerados imprimibles, anulación, gastos, recordatorio por WhatsApp (link wa.me, sin envío automático).
- **Dashboard:** indicadores, próximas sesiones, servicios más vendidos, serie mensual, alertas.

## Pruebas
21 pruebas e2e nuevas (40 en total) y flujo completo en navegador. Verificado en producción con login demo: mascotas, dashboard, agenda, saldos, servicios, programas, Mi día y las pantallas responden 200.

## Datos de demostración
La empresa demo trae 5 mascotas, una entrenadora, 4 servicios, 32 sesiones, cuotas pagadas y vencidas, 7 pagos y gastos.
