import { rpc } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { apiRole } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const { slug } = await params;
  const code = new URL(req.url).searchParams.get('codigo');
  try {
    const ev = await rpc('api_event', { p_slug: slug, p_access_code: code ? code.toUpperCase() : null });
    if (!ev || (ev.status === 'draft' && !(await apiRole(ACCESS.painel)))) return Response.json({ error: 'NAO_ENCONTRADO' }, { status: 404 });
    return Response.json(ev);
  } catch (e) {
    return errorResponse(e, 500);
  }
}
