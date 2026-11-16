'use client';

import useSWR from 'swr';
import { AppShell } from '@/components/app-shell';
import { fetcher } from '@/lib/api';
import { MeProvider } from '@/lib/me';

function WithOrg({ children }: { children: React.ReactNode }) {
  const { data } = useSWR<{ subscription: { status: string; trialEndsAt: string | null } | null }>('/organization', fetcher);
  return <AppShell subscription={data?.subscription}>{children}</AppShell>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MeProvider>
      <WithOrg>{children}</WithOrg>
    </MeProvider>
  );
}
