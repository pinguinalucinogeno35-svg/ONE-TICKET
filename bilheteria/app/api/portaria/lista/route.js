import { rpc } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { apiRole, denied } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';
import { currentSlug } from '@/lib/event';

export const dynamic = 'force-dynamic';

export async function GET() {
  const me = await apiRole(ACCESS.portaria);
  if (!me) return denied();
  try {
    const list = await rpc('api_gate_list', { p_slug: await currentSlug() });
    return Response.json(list);
  } catch (e) {
    return errorResponse(e, 500);
  }
}
