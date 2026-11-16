'use client';

import useSWR from 'swr';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { fetcher } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface Entry {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  actorName: string | null;
  createdAt: string;
}

const LABELS: Record<string, string> = {
  'organization.signup': 'Alta de la empresa',
  'organization.update': 'Editó los datos de la empresa',
  'auth.login': 'Inició sesión',
  'auth.password_changed': 'Cambió su contraseña',
  'client.create': 'Registró un cliente',
  'client.update': 'Editó un cliente',
  'client.deactivate': 'Desactivó un cliente',
  'client.activate': 'Reactivó un cliente',
  'user.invite': 'Agregó a una persona al equipo',
  'user.update': 'Cambió el rol o estado de una persona',
  'role.create': 'Creó un rol',
  'role.update': 'Editó un rol',
  'pet.create': 'Registró una mascota',
  'pet.update': 'Editó una mascota',
  'pet.health_update': 'Actualizó salud y seguridad de una mascota',
  'pet.behavior_update': 'Actualizó el perfil conductual de una mascota',
  'pet.guardian_add': 'Agregó un responsable a una mascota',
  'pet.guardian_remove': 'Quitó un responsable de una mascota',
  'assessment.create': 'Cargó una evaluación inicial',
  'assessment.update': 'Editó una evaluación',
  'service.create': 'Creó un servicio',
  'service.update': 'Editó un servicio',
  'program.create': 'Creó un programa',
  'program.update': 'Editó un programa',
  'program.status_paused': 'Pausó un programa',
  'program.status_active': 'Reactivó un programa',
  'program.status_finished': 'Finalizó un programa',
  'program.status_cancelled': 'Canceló un programa',
  'program.package_adjust': 'Ajustó un paquete de sesiones',
  'session.create': 'Agendó sesiones',
  'session.reschedule': 'Reprogramó una sesión',
  'session.reschedule_late': 'Reprogramó una sesión fuera de plazo',
  'session.confirm': 'Confirmó una sesión',
  'session.cancel': 'Canceló una sesión',
  'session.cancel_late': 'Canceló una sesión fuera de plazo',
  'session.record': 'Registró una sesión',
  'session.no_show': 'Registró una ausencia',
  'session.record_edit': 'Corrigió el registro de una sesión',
  'session.revert': 'Revirtió el registro de una sesión',
  'agenda.working_hours': 'Cambió el horario de un entrenador',
  'charge.create': 'Creó un cargo',
  'charge.cancel': 'Anuló un cargo',
  'payment.create': 'Registró un pago',
  'payment.void': 'Anuló un pago',
  'expense.create': 'Registró un egreso',
  'organization.policies': 'Cambió las políticas de sesiones',
  'saas.support_start': 'Soporte de plataforma ingresó a la cuenta',
  'saas.support_end': 'Soporte de plataforma salió de la cuenta',
  'saas.organization_update': 'La plataforma cambió el plan o estado',
  'saas.manual_payment': 'La plataforma registró un pago de suscripción',
};

export default function AuditoriaPage() {
  const { data } = useSWR<Entry[]>('/audit?limit=100', fetcher);
  return (
    <>
      <PageHeader title="Auditoría" subtitle="Últimas 100 operaciones. Este registro no se puede editar ni borrar." />
      <Card>
        {!data ? (
          <div className="p-10 text-center text-sm text-muted">Cargando…</div>
        ) : data.length === 0 ? (
          <EmptyState title="Sin movimientos todavía" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-[#fafaf8] text-left text-xs text-muted">
                  <th scope="col" className="px-4 py-2.5 font-semibold">Fecha</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">Quién</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Qué hizo</th>
                </tr>
              </thead>
              <tbody>
                {data.map((e) => (
                  <tr key={e.id} className="border-t border-line-soft">
                    <td className="whitespace-nowrap px-4 py-2.5 text-[#44403c]">{fmtDateTime(e.createdAt)}</td>
                    <td className="px-2 py-2.5">{e.actorName ?? 'Sistema'}</td>
                    <td className="px-4 py-2.5">{LABELS[e.action] ?? e.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
