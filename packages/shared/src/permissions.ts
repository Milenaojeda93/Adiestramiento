/**
 * Catálogo de permisos: cada permiso es "módulo:acción".
 * La API es la única que los evalúa; el frontend solo los usa para ocultar menús.
 */
export const MODULES = {
  clients: 'Clientes',
  pets: 'Mascotas',
  assessments: 'Evaluaciones',
  services: 'Servicios',
  programs: 'Programas',
  agenda: 'Agenda',
  sessions: 'Seguimiento',
  finance: 'Finanzas',
  documents: 'Documentos',
  reports: 'Reportes',
  users: 'Usuarios',
  roles: 'Roles y permisos',
  settings: 'Configuración',
  audit: 'Auditoría',
} as const;

export const ACTIONS = {
  read: 'Ver',
  create: 'Crear',
  update: 'Editar',
  delete: 'Eliminar',
  export: 'Exportar',
} as const;

export type ModuleKey = keyof typeof MODULES;
export type ActionKey = keyof typeof ACTIONS;
export type Permission = `${ModuleKey}:${ActionKey}`;

export const ALL_PERMISSIONS: Permission[] = (Object.keys(MODULES) as ModuleKey[]).flatMap((m) =>
  (Object.keys(ACTIONS) as ActionKey[]).map((a) => `${m}:${a}` as Permission),
);

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}

const all = (m: ModuleKey): Permission[] => (Object.keys(ACTIONS) as ActionKey[]).map((a) => `${m}:${a}` as Permission);
const pick = (m: ModuleKey, ...acts: ActionKey[]): Permission[] => acts.map((a) => `${m}:${a}` as Permission);

/**
 * Roles base que recibe cada empresa al darse de alta.
 * `scopeOwn` = el rol solo ve registros asignados a sí mismo (entrenador).
 */
export const BASE_ROLES: { key: string; name: string; description: string; scopeOwn: boolean; permissions: Permission[] }[] = [
  {
    key: 'admin',
    name: 'Administrador',
    description: 'Acceso completo a la empresa.',
    scopeOwn: false,
    permissions: [...ALL_PERMISSIONS],
  },
  {
    key: 'supervisor',
    name: 'Supervisor',
    description: 'Consulta y seguimiento de toda la operación.',
    scopeOwn: false,
    permissions: [
      ...pick('clients', 'read', 'export'),
      ...pick('pets', 'read', 'export'),
      ...pick('assessments', 'read'),
      ...pick('services', 'read'),
      ...pick('programs', 'read'),
      ...pick('agenda', 'read'),
      ...pick('sessions', 'read'),
      ...pick('finance', 'read', 'export'),
      ...pick('documents', 'read'),
      ...pick('reports', 'read', 'export'),
      ...pick('users', 'read'),
      ...pick('audit', 'read'),
    ],
  },
  {
    key: 'trainer',
    name: 'Entrenador',
    description: 'Mascotas asignadas, agenda propia, evaluaciones y sesiones.',
    scopeOwn: true,
    permissions: [
      ...pick('clients', 'read'),
      ...pick('pets', 'read', 'update'),
      ...pick('assessments', 'read', 'create', 'update'),
      ...pick('services', 'read'),
      ...pick('programs', 'read'),
      ...pick('agenda', 'read', 'update'),
      ...pick('sessions', 'read', 'create', 'update'),
      ...pick('documents', 'read', 'create'),
      ...pick('reports', 'read'),
    ],
  },
  {
    key: 'receptionist',
    name: 'Recepcionista',
    description: 'Clientes, mascotas, agenda, turnos y registro de pagos.',
    scopeOwn: false,
    permissions: [
      ...pick('clients', 'read', 'create', 'update'),
      ...pick('pets', 'read', 'create', 'update'),
      ...pick('services', 'read'),
      ...pick('programs', 'read', 'create'),
      ...all('agenda'),
      ...pick('sessions', 'read'),
      ...pick('finance', 'read', 'create'),
      ...pick('documents', 'read', 'create'),
      ...pick('reports', 'read'),
    ],
  },
];
