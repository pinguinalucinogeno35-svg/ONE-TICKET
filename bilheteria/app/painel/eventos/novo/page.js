import { requireRole } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';
import EventForm from '@/components/EventForm';

export const metadata = { title: 'Novo evento · ONE Ticket' };

export default async function NewEventPage() {
  await requireRole(ACCESS.eventos, '/painel/eventos/novo');
  return <EventForm />;
}
