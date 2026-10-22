import { rpc } from '@/lib/db';
import { signSession, sessionCookie } from '@/lib/auth';
import { APP, HOME } from '@/lib/apps';

const safe = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '');

export async function POST(req) {
  const form = await req.formData();
  const next = safe(String(form.get('next') || ''));
  const login = String(form.get('login') || '').slice(0, 40);
  const back = (code) => Response.redirect(new URL(`/entrar?erro=${code}${next ? `&next=${encodeURIComponent(next)}` : ''}&u=${encodeURIComponent(login)}`, req.url), 303);
  let r;
  try {
    r = await rpc('api_staff_login', { p_login: login, p_password: String(form.get('password') || '').slice(0, 200), p_app: APP });
  } catch {
    return back('ERRO_INTERNO');
  }
  if (!r?.ok) return back(r?.error || 'CREDENCIAIS_INVALIDAS');
  const headers = new Headers({ Location: new URL(next || HOME[r.role] || '/', req.url).toString() });
  headers.append('Set-Cookie', sessionCookie(signSession(r)));
  return new Response(null, { status: 303, headers });
}
