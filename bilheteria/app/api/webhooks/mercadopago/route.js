import { rpc } from '@/lib/db';
import { mpEnabled, getPayment, verifyWebhook } from '@/lib/mp';

// Webhook do Mercado Pago. Nunca confia no conteúdo do aviso: consulta o pagamento na API.
export async function POST(req) {
  if (!mpEnabled()) return new Response('desligado', { status: 404 });
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const type = body.type || url.searchParams.get('type') || url.searchParams.get('topic');
  const dataId = body.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id');
  if (type !== 'payment' || !dataId) return new Response('ignorado', { status: 200 });

  if (verifyWebhook(req.headers, dataId) === false) return new Response('assinatura inválida', { status: 401 });

  try {
    await rpc('api_webhook_event', {
      p_gateway: 'mercadopago',
      p_event_id: String(body.id || `${dataId}-${body.action || 'evento'}-${Date.now()}`),
      p_payload: body,
    });
    const p = await getPayment(dataId);
    if (p.status === 'approved' && p.external_reference) {
      await rpc('api_confirm', { p_order_id: p.external_reference, p_gateway: 'mercadopago', p_payment_id: String(p.id) });
    }
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('[webhook]', e);
    return new Response('erro', { status: 500 }); // o MP reenvia
  }
}
