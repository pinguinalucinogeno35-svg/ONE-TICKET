// Sessão por função. Cookie assinado (HMAC) com id, nome, função e validade de 12 horas.
// A permissão é conferida no servidor em cada página e em cada rota da API.
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const COOKIE = 'one_s';
const TTL = 60 * 60 * 12;
const key = () => process.env.COOKIE_SECRET || 'dev';

export function signSession(user) {
  const payload = Buffer.from(JSON.stringify({ i: user.id, n: user.name, r: user.role, e: Math.floor(Date.now() / 1000) + TTL })).toString('base64url');
  const mac = crypto.createHmac('sha256', key()).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

export function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expected = crypto.createHmac('sha256', key()).update(payload).digest('base64url');
  const a = Buffer.from(mac); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!d.e || d.e < Math.floor(Date.now() / 1000)) return null;
    return { id: d.i, name: d.n, role: d.r };
  } catch { return null; }
}

export function sessionCookie(token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL}`;
}
export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function getMe() {
  const store = await cookies();
  return verifySession(store.get(COOKIE)?.value);
}

// Para páginas: sem login vai para /entrar; sem permissão vai para /sem-acesso.
export async function requireRole(roles, next) {
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(next || '/')}`);
  if (!roles.includes(me.role)) redirect('/sem-acesso');
  return me;
}

// Para rotas da API: devolve a sessão ou null.
export async function apiRole(roles) {
  const me = await getMe();
  return me && roles.includes(me.role) ? me : null;
}

export const denied = () => Response.json({ error: 'SEM_PERMISSAO', message: 'Seu acesso não permite esta ação.' }, { status: 403 });
