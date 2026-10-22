import { rpc } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';
import LotsAdmin from '@/components/LotsAdmin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lotes e preços · ONE Ticket' };

export default async function LotsPage() {
  await requireRole(ACCESS.painel, '/painel/lotes');
  const data = await rpc('api_admin_event', { p_slug: process.env.EVENT_SLUG || 'festa-demo' });
  return <LotsAdmin data={data} />;
}
