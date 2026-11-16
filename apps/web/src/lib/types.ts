export interface Me {
  user: { id: string; email: string; name: string; kind: 'STAFF' | 'OWNER' | 'PLATFORM_ADMIN'; mustChangePassword: boolean };
  organization: null | { id: string; name: string; currency: string; timezone: string; readOnly: boolean };
  role: null | { id: string; name: string; scopeOwn: boolean };
  permissions: string[];
  features: Record<string, { enabled: boolean; limit: number | null }>;
  organizations: { id: string; name: string; role: string }[];
  impersonating: boolean;
}

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  documentId: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  isDemo: boolean;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

export interface Role {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  scopeOwn: boolean;
  permissions: string[];
  isSystem: boolean;
}

export interface TeamMember {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  lastLoginAt: string | null;
  active: boolean;
  role: { id: string; name: string; key: string | null };
}

export interface PetListItem {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: 'MALE' | 'FEMALE' | null;
  birthDate: string | null;
  size: string | null;
  alerts: string[];
  status: 'ACTIVE' | 'INACTIVE';
  isDemo: boolean;
  owners: string | null;
  activeProgram: string | null;
}

export interface Guardian {
  id: string;
  role: 'OWNER' | 'AUTHORIZED';
  canPickUp: boolean;
  client: { id: string; firstName: string; lastName: string; phone: string; whatsapp: string | null; email: string | null };
}

export interface Pet extends PetListItem {
  weightKg: string | null;
  color: string | null;
  joinedAt: string;
  health: {
    vaccines?: { name: string; date?: string | null; expires?: string | null }[];
    deworming?: string | null;
    allergies?: string | null;
    conditions?: string | null;
    medications?: string | null;
    restrictions?: string | null;
    vetName?: string | null;
    vetPhone?: string | null;
    emergencyName?: string | null;
    emergencyPhone?: string | null;
  };
  behavior: {
    temperament?: string | null;
    energy?: number | null;
    socialization?: number | null;
    withPeople?: string | null;
    withAnimals?: string | null;
    fears?: string | null;
    problems?: string | null;
    previousTraining?: string | null;
    notes?: string | null;
  };
  guardians: Guardian[];
  counts: { assessments: number; programs: number; sessionsDone: number };
}

export interface Skill {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  sessionsCount: number;
  durationMinutes: number;
  modality: 'CENTER' | 'HOME' | 'ONLINE' | 'GROUP';
  validityDays: number | null;
  conditions: string | null;
  active: boolean;
}

export interface ProgramListItem {
  id: string;
  status: 'PENDING' | 'ACTIVE' | 'PAUSED' | 'FINISHED' | 'CANCELLED';
  startDate: string;
  endDate: string | null;
  expiresAt: string | null;
  sessionsContracted: number;
  price: number;
  goals: string | null;
  service: { id: string; name: string; modality: string };
  pet: { id: string; name: string };
  client: { id: string; firstName: string; lastName: string };
  trainer: { id: string; name: string } | null;
  balance: number;
  done: number;
}

export interface Trainer {
  id: string;
  name: string;
  role: string;
}

export interface AgendaSession {
  id: string;
  startsAt: string;
  endsAt: string;
  status: 'SCHEDULED' | 'CONFIRMED' | 'DONE' | 'CANCELLED' | 'NO_SHOW';
  modality: 'CENTER' | 'HOME' | 'ONLINE' | 'GROUP';
  location: string | null;
  notes: string | null;
  programId: string | null;
  completedAt: string | null;
  pet: { id: string; name: string; breed: string | null; alerts: string[] };
  trainer: { id: string; name: string } | null;
  service: string | null;
  owner: string | null;
  ownerPhone: string | null;
  sessionNumber: number | null;
  sessionsContracted: number | null;
}
