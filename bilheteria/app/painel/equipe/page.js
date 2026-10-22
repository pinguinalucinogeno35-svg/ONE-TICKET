import { rpc } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';
import TeamAdmin from '@/components/TeamAdmin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Equipe · ONE Ticket' };

export default async function TeamPage() {
  const me = await requireRole(ACCESS.equipe, '/painel/equipe');
  const staff = await rpc('api_staff_list');
  return <TeamAdmin staff={staff || []} meId={me.id} />;
}
