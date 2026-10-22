import { rpc } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';
import CouponsAdmin from '@/components/CouponsAdmin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cupons · ONE Ticket' };

export default async function CouponsPage() {
  await requireRole(ACCESS.painel, '/painel/cupons');
  const data = await rpc('api_admin_event', { p_slug: process.env.EVENT_SLUG || 'festa-demo' });
  return <CouponsAdmin data={data} />;
}
