import { rpc } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { apiRole, denied } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';

const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : -1);

// Recebe a fila de vendas do PDV. Reenvio é seguro: cada venda tem um id gerado no aparelho.
export async function POST(req) {
  const me = await apiRole(ACCESS.pdv);
  if (!me) return denied();
  try {
    const { eventId, deviceId, sales } = await req.json();
    const clean = (Array.isArray(sales) ? sales : []).slice(0, 100).map((s) => ({
      client_sale_id: String(s.client_sale_id || '').slice(0, 80),
      payment_method: String(s.payment_method || ''),
      sold_at: s.sold_at,
      items: (Array.isArray(s.items) ? s.items : []).slice(0, 40).map((i) => ({
        product_id: String(i.product_id || ''), qty: int(i.qty), unit_price_cents: int(i.unit_price_cents),
      })),
    })).filter((s) => s.client_sale_id);
    if (!clean.length) return Response.json([]);
    const res = await rpc('api_bar_sync', { p_event_id: eventId, p_device_id: `${String(deviceId || 'Caixa').slice(0, 30)} · ${me.name}`.slice(0, 60), p_sales: clean });
    return Response.json(res);
  } catch (e) {
    return errorResponse(e, 500);
  }
}
