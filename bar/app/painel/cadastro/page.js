import { rpc } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';
import BarAdmin from '@/components/BarAdmin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Produtos e line-up · Bar · ONE Ticket' };

export default async function BarAdminPage() {
  await requireRole(ACCESS.painel, '/painel/cadastro');
  const data = await rpc('api_bar_dashboard', { p_slug: process.env.EVENT_SLUG || 'festa-demo' });
  if (data) data.tickets_cents = null;
  return <BarAdmin data={data} />;
}
