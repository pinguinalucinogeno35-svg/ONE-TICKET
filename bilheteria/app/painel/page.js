import { rpc } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';
import DashboardClient from '@/components/DashboardClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bilheteria · ONE Ticket' };

export default async function PanelPage() {
  await requireRole(ACCESS.painel, '/painel');
  const slug = process.env.EVENT_SLUG || 'festa-demo';
  const data = await rpc('api_dashboard', { p_slug: slug });
  return <DashboardClient data={data} />;
}
