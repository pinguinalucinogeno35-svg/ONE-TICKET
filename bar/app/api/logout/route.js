import { clearCookie } from '@/lib/auth';

export async function POST(req) {
  const headers = new Headers({ Location: new URL('/entrar', req.url).toString() });
  headers.append('Set-Cookie', clearCookie);
  return new Response(null, { status: 303, headers });
}
