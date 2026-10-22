import { rpc } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';
import { MeProvider } from '@/components/MeContext';
import BarPOS from '@/components/BarPOS';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'PDV · Bar · ONE Ticket' };

export default async function PosPage() {
  const me = await requireRole(ACCESS.pdv, '/pdv');
  let catalog = null;
  try {
    catalog = await rpc('api_bar_catalog', { p_slug: process.env.EVENT_SLUG || 'festa-demo' });
  } catch {}
  return <MeProvider me={me}><BarPOS initial={catalog} /></MeProvider>;
}
