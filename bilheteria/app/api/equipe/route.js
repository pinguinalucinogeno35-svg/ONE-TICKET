import { rpc } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { apiRole, denied } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';

const ROLES = ['produtor', 'bilheteria', 'portaria', 'gerente_bar', 'caixa_bar'];

export async function POST(req) {
  const me = await apiRole(ACCESS.equipe);
  if (!me) return denied();
  try {
    const b = await req.json();
    const id = await rpc('api_staff_upsert', {
      p_slug: process.env.EVENT_SLUG || 'festa-demo',
      p_id: b.id || null,
      p_name: String(b.name || '').slice(0, 60),
      p_login: String(b.login || '').slice(0, 30),
      p_role: ROLES.includes(b.role) ? b.role : 'x',
      p_password: b.password ? String(b.password).slice(0, 100) : null,
      p_active: b.active !== false,
      p_actor: me.name,
    });
    return Response.json({ ok: true, id });
  } catch (e) {
    return errorResponse(e);
  }
}
