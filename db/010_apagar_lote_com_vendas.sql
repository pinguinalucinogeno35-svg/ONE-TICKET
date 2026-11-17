-- =============================================================================
-- 010: apagar lote mesmo com vendas (ex.: lote de teste, promoção que acabou)
-- Só bloqueia se houver reserva em andamento (alguém pagando agora).
-- Lote com venda vira removido (soft delete): some do painel e da página do
-- evento, mas os pedidos e ingressos já vendidos continuam valendo na portaria
-- e entram no faturamento. Lote sem nenhum pedido sai do banco, como antes.
-- =============================================================================

create or replace function api_batch_delete(p_secret text, p_batch_id uuid, p_actor text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b batches%rowtype; e events%rowtype; v_soft boolean; v_opened uuid;
begin
  perform private.assert_secret(p_secret);
  select * into b from batches where id = p_batch_id and not removed;
  if not found then raise exception 'LOTE_NAO_ENCONTRADO'; end if;
  select * into e from events where id = b.event_id for update;           -- trava do evento
  select * into b from batches where id = p_batch_id for update;
  if b.reserved > 0 then raise exception 'LOTE_COM_RESERVA'; end if;

  v_soft := b.sold > 0 or exists (select 1 from order_items where batch_id = b.id);
  if v_soft then
    update batches set removed = true, status = 'closed', closed_at = coalesce(closed_at, now()) where id = b.id;
  else
    delete from batches where id = b.id;
  end if;

  -- Era o lote à venda da trilha: abre o próximo agendado (sem sobra, a trilha está sem ativo)
  if b.status = 'active' then
    v_opened := advance_batch(b.event_id, b.track, 'lote_apagado');
  end if;

  insert into audit_log (org_id, action, entity, entity_id, data)
  values (e.org_id, 'batch_deleted', 'batch', b.id,
          jsonb_build_object('by', p_actor, 'name', b.name, 'track', b.track, 'quantity', b.quantity,
                             'sold', b.sold, 'status', b.status, 'soft', v_soft, 'opened_next', v_opened));
  return jsonb_build_object('ok', true, 'opened_next', v_opened, 'sold', b.sold);
end $$;

create or replace function api_admin_event(p_secret text, p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events%rowtype;
begin
  perform private.assert_secret(p_secret);
  select * into e from events where slug = p_slug;
  if not found then return null; end if;
  return jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'capacity', e.capacity,
                                'seats_sold', e.seats_sold, 'seats_reserved', e.seats_reserved),
    'batches', coalesce((select jsonb_agg(jsonb_build_object(
        'id', b.id, 'track', b.track, 'position', b.position, 'name', b.name, 'quantity', b.quantity,
        'sold', b.sold, 'reserved', b.reserved, 'status', b.status, 'starts_at', b.starts_at, 'ends_at', b.ends_at,
        'visibility', b.visibility, 'access_code', b.access_code,
        'can_delete', b.reserved = 0,
        'offers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'variant', o.variant, 'price_cents', o.price_cents)
                   order by array_position(array['inteira','meia','casadinha']::offer_variant[], o.variant))
                 from offers o where o.batch_id = b.id), '[]'::jsonb))
        order by b.track, b.position) from batches b where b.event_id = e.id and not b.removed), '[]'::jsonb),
    'coupons', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'code', c.code, 'owner_name', c.owner_name, 'owner_kind', c.owner_kind, 'kind', c.kind,
        'value', c.value, 'max_uses', c.max_uses, 'used', c.used, 'reserved', c.reserved,
        'valid_until', c.valid_until, 'active', c.active,
        'seats', (select coalesce(sum(o.seats), 0) from orders o where o.coupon_id = c.id and o.status = 'paid'),
        'revenue_cents', (select coalesce(sum(o.total_cents), 0) from orders o where o.coupon_id = c.id and o.status = 'paid'))
        order by c.active desc, c.created_at) from coupons c where c.event_id = e.id), '[]'::jsonb)
  );
end $$;

revoke all on function api_batch_delete(text, uuid, text) from public;
revoke all on function api_admin_event(text, text) from public;
grant execute on function api_batch_delete(text, uuid, text) to anon, authenticated, service_role;
grant execute on function api_admin_event(text, text) to anon, authenticated, service_role;
