import { notFound } from 'next/navigation';
import { rpc } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';
import { panelSlug } from '@/lib/event';
import EventForm from '@/components/EventForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Editar evento · ONE Ticket' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditEventPage({ params }) {
  const { id } = await params;
  await requireRole(ACCESS.eventos, `/painel/eventos/${id}`);
  if (!UUID.test(id)) notFound();
  const event = await rpc('api_event_detail', { p_id: id });
  if (!event) notFound();
  return <EventForm key={`${event.id}-${event.slug}-${event.status}-${event.capacity}`} event={event} panel={await panelSlug()} />;
}
