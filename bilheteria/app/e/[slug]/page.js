import { notFound } from 'next/navigation';
import { rpc } from '@/lib/db';
import { getMe } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';
import EventClient from '@/components/EventClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const ev = await rpc('api_event', { p_slug: slug });
    if (ev && ev.status !== 'draft') {
      const description = [ev.venue_name, ev.city].filter(Boolean).join(' · ');
      return {
        title: `${ev.name} · ONE Ticket`, description,
        openGraph: { title: ev.name, description, images: ev.image_url ? [ev.image_url] : undefined },
      };
    }
  } catch {}
  return { title: 'ONE Ticket' };
}

export default async function EventPage({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const code = typeof sp?.codigo === 'string' ? sp.codigo.toUpperCase() : null;
  const coupon = typeof sp?.cupom === 'string' ? sp.cupom.toUpperCase().slice(0, 40) : null;
  const event = await rpc('api_event', { p_slug: slug, p_access_code: code });
  if (!event) notFound();
  // Rascunho: só a equipe do painel vê (prévia)
  if (event.status === 'draft') {
    const me = await getMe();
    if (!me || !ACCESS.painel.includes(me.role)) notFound();
  }
  return <EventClient initial={event} accessCode={code} couponCode={coupon} />;
}
