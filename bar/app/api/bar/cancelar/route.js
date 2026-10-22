import { rpc } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { apiRole, denied } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';

export async function POST(req) {
  const me = await apiRole(ACCESS.cancelar);
  if (!me) return denied();
  try {
    const { clientSaleId, deviceId } = await req.json();
    const res = await rpc('api_bar_cancel', { p_client_sale_id: String(clientSaleId || ''), p_actor: `${me.name} (${String(deviceId || 'PDV').slice(0, 30)})`.slice(0, 60) });
    return Response.json(res);
  } catch (e) {
    return errorResponse(e);
  }
}
