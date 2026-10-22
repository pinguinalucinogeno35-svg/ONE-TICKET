import { rpc } from '@/lib/db';
import { errorResponse } from '@/lib/errors';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req) {
  try {
    const b = await req.json();
    const name = String(b.name || '').trim().slice(0, 120);
    const email = String(b.email || '').trim().slice(0, 160);
    if (name.length < 3 || !EMAIL.test(email)) {
      return Response.json({ error: 'DADOS_INVALIDOS', message: 'Confira nome e e-mail.' }, { status: 400 });
    }
    const items = Array.isArray(b.items)
      ? b.items.map((i) => ({ offer_id: String(i.offer_id), quantity: Math.max(0, Math.min(8, parseInt(i.quantity, 10) || 0)) }))
               .filter((i) => i.quantity > 0)
      : [];
    const r = await rpc('api_reserve', {
      p_event_id: b.eventId,
      p_items: items,
      p_buyer_name: name,
      p_buyer_email: email,
      p_payment_method: b.method === 'card' ? 'card' : 'pix',
      p_coupon_code: b.coupon || null,
      p_access_code: b.accessCode || null,
      p_idempotency_key: b.idempotencyKey ? String(b.idempotencyKey).slice(0, 80) : null,
    });
    return Response.json(r);
  } catch (e) {
    return errorResponse(e);
  }
}
