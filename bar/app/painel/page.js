import { rpc } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';
import BarDashboard from '@/components/BarDashboard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Painel · Bar · ONE Ticket' };

export default async function BarPanelPage() {
  const me = await requireRole(ACCESS.painel, '/painel');
  const data = await rpc('api_bar_dashboard', { p_slug: process.env.EVENT_SLUG || 'festa-demo' });
  // Receita de ingressos só para o produtor
  if (data && me.role !== 'produtor') data.tickets_cents = null;
  return <BarDashboard data={data} />;
}
