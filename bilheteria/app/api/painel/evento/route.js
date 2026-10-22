import { rpc } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { apiRole, denied } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';
import { currentSlug, eventCookie } from '@/lib/event';

const STATUS = ['draft', 'on_sale', 'paused', 'closed'];
const TEXT = {
  name: 120, slug: 60, venue_name: 120, address: 200, city: 80, state: 2, age_rating: 2,
  image_url: 500, description: 6000, cancel_policy: 2000, producer_name: 120, producer_about: 2000, contact: 160,
};
const int = (v) => (v === null || v === undefined || v === '' ? '' : String(parseInt(v, 10)));
const iso = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// Só os campos conhecidos, cortados no tamanho; o banco confere as regras.
function clean(f) {
  const out = {};
  for (const [k, max] of Object.entries(TEXT)) out[k] = String(f?.[k] ?? '').trim().slice(0, max);
  out.slug = out.slug.toLowerCase();
  out.starts_at = iso(f?.starts_at);
  out.ends_at = iso(f?.ends_at);
  out.capacity = int(f?.capacity);
  out.half_quota = int(f?.half_quota);
  out.max_seats_per_order = int(f?.max_seats_per_order);
  return out;
}

const ok = (body, slug) => {
  const headers = slug ? { 'Set-Cookie': eventCookie(slug) } : undefined;
  return Response.json({ ok: true, ...body }, { headers });
};

export async function POST(req) {
  const me = await apiRole(ACCESS.eventos);
  if (!me) return denied();
  try {
    const b = await req.json();
    switch (b.action) {
      case 'salvar': {
        const data = clean(b.data);
        if (!data.starts_at || data.ends_at === null) {
          return Response.json({ error: 'DADOS_INVALIDOS', message: 'Confira as datas do evento.' }, { status: 400 });
        }
        const id = await rpc('api_event_save', { p_slug: await currentSlug(), p_id: b.id || null, p_data: data, p_actor: me.name });
        // Evento novo (ou endereço trocado) já abre no painel deste aparelho
        return ok({ id, slug: data.slug }, !b.id || b.openInPanel ? data.slug : null);
      }
      case 'status': {
        if (!STATUS.includes(b.status)) return Response.json({ error: 'ACAO_INVALIDA', message: 'Ação inválida.' }, { status: 400 });
        await rpc('api_event_set_status', { p_id: b.id, p_status: b.status, p_actor: me.name });
        return ok({ status: b.status });
      }
      case 'noite': {
        const r = await rpc('api_event_set_current', { p_id: b.id, p_actor: me.name });
        return ok({ slug: r.slug }, r.slug);
      }
      case 'painel': {
        const slug = String(b.slug || '');
        if (!/^[a-z0-9-]{3,60}$/.test(slug)) return Response.json({ error: 'ACAO_INVALIDA', message: 'Ação inválida.' }, { status: 400 });
        return ok({ slug }, slug);
      }
      default:
        return Response.json({ error: 'ACAO_INVALIDA', message: 'Ação inválida.' }, { status: 400 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
