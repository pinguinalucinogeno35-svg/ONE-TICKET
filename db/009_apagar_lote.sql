-- =============================================================================
-- 009: apagar lote criado por engano (aba Lotes e preços)
-- Só apaga lote sem venda e sem reserva em andamento. Sem nenhum pedido no
-- histórico, a linha sai do banco (as ofertas vão junto). Se já houve pedido
-- (expirado ou cancelado), o lote fica marcado como removido (soft delete,
-- como lineup.removed) e some das telas. Se o lote estava à venda, o próximo
-- agendado da mesma trilha abre na hora, sem levar a sobra do lote apagado.
-- =============================================================================

alter table batches add column removed boolean not null default false;

create or replace function api_batch_delete(p_secret text, p_batch_id uuid, p_actor text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b batches%rowtype; e events%rowtype; v_soft boolean; v_opened uuid;
begin
  perform private.assert_secret(p_secret);
  select * into b from batches where id = p_batch_id and not removed;
  if not found then raise exception 'LOTE_NAO_ENCONTRADO'; end if;
  select * into e from events where id = b.event_id for update;           -- trava do evento
  select * into b from batches where id = p_batch_id for update;
  if b.sold > 0 or b.reserved > 0 then raise exception 'LOTE_COM_VENDAS'; end if;

  v_soft := exists (select 1 from order_items where batch_id = b.id);
  if v_soft then
    update batches set removed = true, status = 'closed', closed_at = now() where id = b.id;
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
                             'status', b.status, 'soft', v_soft, 'opened_next', v_opened));
  return jsonb_build_object('ok', true, 'opened_next', v_opened);
end $$;

-- Telas que listam lotes passam a ignorar os removidos
create or replace function api_event(p_secret text, p_slug text, p_access_code text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform private.assert_secret(p_secret);
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'slug', e.slug, 'venue_name', e.venue_name, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'status', e.status, 'capacity', e.capacity, 'available', e.capacity - e.seats_sold - e.seats_reserved,
    'max_seats_per_order', e.max_seats_per_order, 'service_fee_bps', e.service_fee_bps,
    'reservation_minutes', e.reservation_minutes,
    'half_available', greatest(e.half_quota - e.half_sold - e.half_reserved, 0),
    'description', e.description, 'image_url', e.image_url, 'address', e.address, 'city', e.city, 'state', e.state,
    'age_rating', e.age_rating, 'cancel_policy', e.cancel_policy, 'producer_name', e.producer_name,
    'producer_about', e.producer_about, 'contact', e.contact,
    'batches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'track', b.track, 'position', b.position, 'name', b.name,
        'quantity', b.quantity, 'taken', b.sold + b.reserved, 'status', b.status,
        'starts_at', b.starts_at, 'ends_at', b.ends_at, 'visibility', b.visibility,
        'offers', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', o.id, 'variant', o.variant, 'price_cents', o.price_cents, 'seats', o.seats_per_unit)
                    order by array_position(array['inteira','meia','casadinha']::offer_variant[], o.variant))
                  from offers o where o.batch_id = b.id), '[]'::jsonb)
      ) order by b.track, b.position)
      from batches b
      where b.event_id = e.id and not b.removed and (b.visibility = 'public' or b.access_code = p_access_code)), '[]'::jsonb)
  ) into v
  from events e where e.slug = p_slug;
  return v;
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
        'can_delete', b.sold = 0 and b.reserved = 0,
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

create or replace function api_dashboard(p_secret text, p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events%rowtype; v jsonb;
begin
  perform private.assert_secret(p_secret);
  select * into e from events where slug = p_slug;
  if not found then return null; end if;

  select jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'starts_at', e.starts_at, 'venue_name', e.venue_name,
                                'capacity', e.capacity, 'seats_sold', e.seats_sold, 'seats_reserved', e.seats_reserved,
                                'half_quota', e.half_quota, 'half_sold', e.half_sold),
    'summary', (select to_jsonb(s) from event_summary s where s.event_id = e.id),
    'batches', (select jsonb_agg(jsonb_build_object(
                  'id', b.id, 'track', b.track, 'position', b.position, 'name', b.name, 'quantity', b.quantity,
                  'sold', b.sold, 'reserved', b.reserved, 'status', b.status, 'ends_at', b.ends_at, 'visibility', b.visibility,
                  'price_cents', (select price_cents from offers where batch_id = b.id and variant = 'inteira'))
                  order by b.track, b.position)
                from batches b where b.event_id = e.id and not b.removed),
    'by_variant', (select coalesce(jsonb_object_agg(variant, seats), '{}'::jsonb) from (
                    select oi.variant, sum(oi.seats) seats from order_items oi join orders o on o.id = oi.order_id
                     where o.event_id = e.id and o.status = 'paid' group by oi.variant) x),
    'coupons', (select coalesce(jsonb_agg(jsonb_build_object(
                  'code', upper(c.code), 'owner_name', c.owner_name, 'owner_kind', c.owner_kind, 'kind', c.kind, 'value', c.value,
                  'used', c.used, 'max_uses', c.max_uses,
                  'seats', (select coalesce(sum(o.seats), 0) from orders o where o.coupon_id = c.id and o.status = 'paid'),
                  'revenue_cents', (select coalesce(sum(o.total_cents), 0) from orders o where o.coupon_id = c.id and o.status = 'paid'),
                  'discount_cents', (select coalesce(sum(o.discount_cents), 0) from orders o where o.coupon_id = c.id and o.status = 'paid'))
                  order by c.used desc), '[]'::jsonb)
                from coupons c where c.event_id = e.id),
    'recent', (select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
                 select jsonb_build_object('id', o.id, 'buyer_name', o.buyer_name, 'seats', o.seats, 'total_cents', o.total_cents,
                                           'status', o.status, 'payment_method', o.payment_method, 'created_at', o.created_at) x
                   from orders o where o.event_id = e.id order by o.created_at desc limit 12) r),
    'checkins', jsonb_build_object(
                  'accepted', (select count(*) from checkins where event_id = e.id and result = 'accepted'),
                  'duplicate', (select count(*) from checkins where event_id = e.id and result = 'duplicate')),
    'needs_refund', (select count(*) from orders where event_id = e.id and status = 'needs_refund')
  ) into v;
  return v;
end $$;

do $$
declare f record;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname like 'api\_%' loop
      execute format('revoke execute on function %s from public', f.sig);
      execute format('grant execute on function %s to anon, authenticated, service_role', f.sig);
    end loop;
  end if;
end $$;
