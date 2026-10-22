import { rpc } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { apiRole, denied } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';

const VARIANTS = ['inteira', 'meia', 'casadinha'];
const int = (v) => (v === null || v === undefined || v === '' ? null : parseInt(v, 10));

export async function POST(req) {
  const me = await apiRole(ACCESS.painel);
  if (!me) return denied();
  try {
    const b = await req.json();
    switch (b.action) {
      case 'lote_salvar': {
        await rpc('api_batch_update', {
          p_batch_id: b.batchId, p_name: String(b.name || '').slice(0, 60), p_quantity: int(b.quantity),
          p_ends_at: b.endsAt || null, p_actor: me.name,
        });
        for (const v of VARIANTS) {
          const price = b.prices ? int(b.prices[v]) : null;
          if (price !== null && !Number.isNaN(price)) {
            await rpc('api_offer_set', { p_batch_id: b.batchId, p_variant: v, p_price_cents: price, p_actor: me.name });
          }
        }
        return Response.json({ ok: true });
      }
      case 'lote_criar': {
        const id = await rpc('api_batch_create', {
          p_event_id: b.eventId, p_track: b.track === 'promocional' ? 'promocional' : 'principal',
          p_name: String(b.name || '').slice(0, 60), p_quantity: int(b.quantity),
          p_price_inteira: int(b.prices?.inteira), p_price_meia: int(b.prices?.meia), p_price_casadinha: int(b.prices?.casadinha),
          p_ends_at: b.endsAt || null, p_visibility: b.visibility === 'link' ? 'link' : 'public', p_access_code: b.accessCode || null,
        });
        return Response.json({ ok: true, id });
      }
      case 'cupom_salvar': {
        const kind = ['percent', 'fixed', 'courtesy'].includes(b.kind) ? b.kind : 'percent';
        const id = await rpc('api_coupon_upsert', {
          p_event_id: b.eventId, p_id: b.id || null, p_code: String(b.code || '').slice(0, 40),
          p_owner_name: String(b.ownerName || '').slice(0, 80),
          p_owner_kind: ['influencer', 'sponsor', 'promoter', 'other'].includes(b.ownerKind) ? b.ownerKind : 'influencer',
          p_kind: kind, p_value: int(b.value), p_max_uses: int(b.maxUses), p_valid_until: b.validUntil || null,
          p_active: b.active !== false,
        });
        return Response.json({ ok: true, id });
      }
      case 'cupom_ativo': {
        await rpc('api_coupon_set_active', { p_id: b.id, p_active: !!b.active });
        return Response.json({ ok: true });
      }
      default:
        return Response.json({ error: 'ACAO_INVALIDA', message: 'Ação inválida.' }, { status: 400 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
