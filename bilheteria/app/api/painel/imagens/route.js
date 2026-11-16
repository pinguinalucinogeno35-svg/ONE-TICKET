import { rpc } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { apiRole, denied } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME = ['image/jpeg', 'image/png', 'image/webp'];
const bad = () => Response.json({ error: 'IMAGEM_INVALIDA', message: 'Imagem inválida. Use JPG, PNG ou WebP.' }, { status: 400 });

// Origem pública https do app (APP_URL em produção; senão a da própria requisição)
function base(req) {
  const fromEnv = (process.env.APP_URL || '').replace(/\/+$/, '');
  if (/^https:\/\//.test(fromEnv)) return fromEnv;
  const host = req.headers.get('x-forwarded-host') || new URL(req.url).host;
  return `https://${host}`;
}

export async function GET(req) {
  const me = await apiRole(ACCESS.eventos);
  if (!me) return denied();
  const id = new URL(req.url).searchParams.get('evento') || '';
  if (!UUID.test(id)) return bad();
  try {
    return Response.json({ images: await rpc('api_event_images', { p_event_id: id }) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req) {
  const me = await apiRole(ACCESS.eventos);
  if (!me) return denied();
  try {
    const b = await req.json();
    if (b.action === 'enviar') {
      if (!UUID.test(String(b.eventId)) || !['cover', 'gallery'].includes(b.kind) || !MIME.includes(b.mime)) return bad();
      const data = String(b.data || '');
      if (!/^[A-Za-z0-9+/=]+$/.test(data) || data.length > 4_200_000) return bad();
      const r = await rpc('api_event_image_add', {
        p_event_id: b.eventId, p_kind: b.kind, p_mime: b.mime, p_data_b64: data, p_base: base(req), p_actor: me.name,
      });
      return Response.json({ ok: true, ...r });
    }
    if (b.action === 'remover') {
      if (!UUID.test(String(b.id))) return bad();
      const r = await rpc('api_event_image_remove', { p_id: b.id, p_actor: me.name });
      return Response.json({ ok: true, ...r });
    }
    return Response.json({ error: 'ACAO_INVALIDA', message: 'Ação inválida.' }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}
