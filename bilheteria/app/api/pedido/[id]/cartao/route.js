import { rpc } from '@/lib/db';
import { errorResponse, messageFor } from '@/lib/errors';
import { mpEnabled, createCardPayment } from '@/lib/mp';

export async function POST(req, { params }) {
  const { id } = await params;
  if (!mpEnabled()) return Response.json({ error: 'NAO_AUTORIZADO' }, { status: 403 });
  try {
    const form = await req.json();
    const o = await rpc('api_order', { p_order_id: id });
    if (!o || o.status !== 'pending') return Response.json({ error: 'PEDIDO_NAO_ENCONTRADO' }, { status: 404 });
    const p = await createCardPayment(o, form);
    await rpc('api_set_gateway', { p_order_id: id, p_gateway: 'mercadopago', p_payment_id: String(p.id), p_method: 'card' });
    if (p.status === 'approved') {
      const status = await rpc('api_confirm', { p_order_id: id, p_gateway: 'mercadopago', p_payment_id: String(p.id) });
      return Response.json({ status });
    }
    if (p.status === 'in_process' || p.status === 'pending') {
      return Response.json({ status: 'pending', message: 'Pagamento em análise. Avisaremos quando for aprovado.' });
    }
    return Response.json({ status: 'rejected', message: messageFor('PAGAMENTO_RECUSADO'), detail: p.status_detail });
  } catch (e) {
    return errorResponse(e, 502);
  }
}
