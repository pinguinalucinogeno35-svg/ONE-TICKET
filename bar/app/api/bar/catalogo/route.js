import { rpc } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { apiRole, denied } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';

export const dynamic = 'force-dynamic';

export async function GET() {
  const me = await apiRole(ACCESS.pdv);
  if (!me) return denied();
  try {
    return Response.json(await rpc('api_bar_catalog', { p_slug: process.env.EVENT_SLUG || 'festa-demo' }));
  } catch (e) {
    return errorResponse(e, 500);
  }
}
