import { rpc } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { apiRole, denied } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';

export async function POST(req) {
  const me = await apiRole(ACCESS.painel);
  if (!me) return denied();
  try {
    const { eventId, track } = await req.json();
    const res = await rpc('api_batch_revert', { p_event_id: eventId, p_track: track || 'principal', p_actor: me.name });
    return Response.json(res);
  } catch (e) {
    return errorResponse(e);
  }
}
