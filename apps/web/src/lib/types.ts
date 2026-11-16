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
