import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { rpc } from '@/lib/db';
import { signTicket } from '@/lib/sign';
import TicketsClient from '@/components/TicketsClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Meus ingressos' };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function TicketsPage({ params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const order = await rpc('api_order', { p_order_id: id });
  if (!order) notFound();
  if (order.status !== 'paid') redirect(`/pedido/${id}`);
  const tickets = await rpc('api_tickets', { p_order_id: id });

  const withQr = await Promise.all(
    tickets.map(async (t) => {
      const token = signTicket(t.code, t.issued_at);
      const qr = await QRCode.toDataURL(token, { margin: 1, width: 520, errorCorrectionLevel: 'M' });
      return { ...t, token, qr };
    })
  );

  return <TicketsClient order={order} tickets={withQr} />;
}
