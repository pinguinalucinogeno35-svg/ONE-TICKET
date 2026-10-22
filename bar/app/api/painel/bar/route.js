import { rpc } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { apiRole, denied } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';

const int = (v) => (v === null || v === undefined || v === '' ? null : parseInt(v, 10));
const txt = (v, n) => String(v || '').trim().slice(0, n);

// Cadastro do bar pelo painel: produtos, entrada de estoque e line-up.
export async function POST(req) {
  const me = await apiRole(ACCESS.painel);
  if (!me) return denied();
  try {
    const b = await req.json();
    switch (b.action) {
      case 'produto_salvar': {
        const id = await rpc('api_bar_product_upsert', {
          p_event_id: b.eventId, p_id: b.id || null, p_name: txt(b.name, 60), p_category: txt(b.category, 40),
          p_unit_label: txt(b.unitLabel, 20), p_price_cents: int(b.priceCents), p_cost_cents: int(b.costCents) ?? 0,
          p_units_per_case: int(b.unitsPerCase) || 1, p_low_stock_units: int(b.lowStockUnits) ?? 0, p_active: b.active !== false,
        });
        return Response.json({ ok: true, id });
      }
      case 'estoque_entrada': {
        const res = await rpc('api_bar_stock_entry', {
          p_product_id: b.productId, p_cases: int(b.cases) ?? 0, p_units: int(b.units) ?? 0, p_note: txt(b.note, 200) || null,
        });
        return Response.json(res);
      }
      case 'show_salvar': {
        const id = await rpc('api_lineup_upsert', {
          p_event_id: b.eventId, p_id: b.id || null, p_artist: txt(b.artist, 80), p_stage: txt(b.stage, 40),
          p_starts_at: b.startsAt || null, p_ends_at: b.endsAt || null,
        });
        return Response.json({ ok: true, id });
      }
      case 'show_remover': {
        await rpc('api_lineup_remove', { p_id: b.id });
        return Response.json({ ok: true });
      }
      default:
        return Response.json({ error: 'ACAO_INVALIDA', message: 'Ação inválida.' }, { status: 400 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
