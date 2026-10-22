import { rpc } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { mpEnabled } from '@/lib/mp';

// Só existe no modo demonstração: aprova ou recusa o pagamento sem gateway
export async function POST(req, { params }) {
  const { id } = await params;
  if (mpEnabled()) return Response.json({ error: 'NAO_AUTORIZADO' }, { status: 403 });
  try {
    const { outcome, method } = await req.json().catch(() => ({}));
    if (outcome === 'reject') {
      const status = await rpc('api_cancel', { p_order_id: id });
      return Response.json({ status, message: 'Pagamento recusado. Os ingressos voltaram para a venda.' });
    }
    await rpc('api_set_gateway', {
      p_order_id: id, p_gateway: 'simulado', p_payment_id: `sim-${id}`, p_method: method === 'card' ? 'card' : 'pix',
    });
    const status = await rpc('api_confirm', { p_order_id: id, p_gateway: 'simulado', p_payment_id: `sim-${id}` });
    return Response.json({ status });
  } catch (e) {
    return errorResponse(e);
  }
}
