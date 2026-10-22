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
    const tickets = await rpc('api_transfer', { p_order_id: b.orderId, p_ticket_id: b.ticketId, p_name: name, p_email: email });
    return Response.json({ ok: true, count: tickets.length });
  } catch (e) {
    return errorResponse(e);
  }
}
