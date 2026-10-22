import { notFound, redirect } from 'next/navigation';
import { rpc } from '@/lib/db';
import { mpEnabled, mpPublicKey } from '@/lib/mp';
import CheckoutClient from '@/components/CheckoutClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pagamento · Ingressos' };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function OrderPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const order = await rpc('api_order', { p_order_id: id });
  if (!order) notFound();
  if (order.status === 'paid') redirect(`/ingressos/${id}`);
  return (
    <CheckoutClient
      order={order}
      mode={mpEnabled() ? 'mercadopago' : 'simulado'}
      mpPublicKey={mpPublicKey()}
      initialMethod={sp?.m === 'card' ? 'card' : 'pix'}
    />
  );
}
