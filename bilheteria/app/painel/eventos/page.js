import { rpc } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';
import { currentSlug, panelSlug } from '@/lib/event';
import EventsAdmin from '@/components/EventsAdmin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Eventos · ONE Ticket' };

export default async function EventsPage() {
  await requireRole(ACCESS.eventos, '/painel/eventos');
  const events = await rpc('api_events_list', { p_slug: await currentSlug() });
  return <EventsAdmin events={events || []} panel={await panelSlug()} />;
}
