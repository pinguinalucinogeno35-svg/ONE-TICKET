import { rpc } from '@/lib/db';
import { errorResponse, messageFor } from '@/lib/errors';

export async function POST(req) {
  try {
    const { eventId, code } = await req.json();
    if (!eventId || !code) return Response.json({ valid: false, message: messageFor('CUPOM_INVALIDO') });
    const r = await rpc('api_coupon_check', { p_event_id: eventId, p_code: String(code).slice(0, 40) });
    if (!r.valid) return Response.json({ valid: false, message: messageFor(r.reason) });
    return Response.json(r);
  } catch (e) {
    return errorResponse(e);
  }
}
