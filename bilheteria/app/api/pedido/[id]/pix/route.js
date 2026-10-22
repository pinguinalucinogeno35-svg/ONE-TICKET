import { rpc } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { mpEnabled, createPix } from '@/lib/mp';

export async function POST(req, { params }) {
  const { id } = await params;
  if (!mpEnabled()) return Response.json({ error: 'NAO_AUTORIZADO' }, { status: 403 });
  try {
    const o = await rpc('api_order', { p_order_id: id });
    if (!o || o.status !== 'pending') return Response.json({ error: 'PEDIDO_NAO_ENCONTRADO' }, { status: 404 });
    const p = await createPix(o); // idempotente por pedido
    await rpc('api_set_gateway', { p_order_id: id, p_gateway: 'mercadopago', p_payment_id: String(p.id), p_method: 'pix' });
    const tx = p.point_of_interaction?.transaction_data || {};
    return Response.json({ qr_code: tx.qr_code, qr_code_base64: tx.qr_code_base64, payment_id: p.id });
  } catch (e) {
    return errorResponse(e, 502);
  }
}
