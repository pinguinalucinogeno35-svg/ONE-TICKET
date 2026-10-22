import { rpc } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { mpEnabled, getPayment } from '@/lib/mp';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const { id } = await params;
  try {
    let o = await rpc('api_order', { p_order_id: id });
    if (!o) return Response.json({ error: 'PEDIDO_NAO_ENCONTRADO' }, { status: 404 });
    // Reconciliação: se o webhook atrasar, consulta o gateway direto
    if (o.status === 'pending' && mpEnabled() && o.gateway === 'mercadopago' && o.gateway_payment_id) {
      try {
        const p = await getPayment(o.gateway_payment_id);
        if (p.status === 'approved' && p.external_reference === o.id) {
          await rpc('api_confirm', { p_order_id: o.id, p_gateway: 'mercadopago', p_payment_id: String(p.id) });
          o = await rpc('api_order', { p_order_id: id });
        }
      } catch {}
    }
    return Response.json({ status: o.status, expires_at: o.expires_at, now: o.now });
  } catch (e) {
    return errorResponse(e, 500);
  }
}
