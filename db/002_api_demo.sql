-- =============================================================================
-- 002: camada de API para o app (Next.js no servidor chama estas funções)
-- -----------------------------------------------------------------------------
-- Toda função api_* exige o segredo do servidor (guardado só nas variáveis de
-- ambiente da Vercel e na tabela private.app_config). O navegador nunca chama
-- o banco direto. Em produção, dá para trocar isso pela chave service_role.
-- O valor do segredo é inserido à parte (não fica no repositório):
--   insert into private.app_config values ('api_secret', '<SEGREDO>');
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema private from anon, authenticated';
  end if;
end $$;

create table if not exists private.app_config (
  key   text primary key,
  value text not null
);

create or replace function private.assert_secret(p_secret text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or p_secret is distinct from (select value from private.app_config where key = 'api_secret') then
    raise exception 'NAO_AUTORIZADO';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Página do evento: evento + lotes visíveis + ofertas
-- -----------------------------------------------------------------------------
create or replace function api_event(p_secret text, p_slug text, p_access_code text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform private.assert_secret(p_secret);
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'slug', e.slug, 'venue_name', e.venue_name, 'starts_at', e.starts_at,
    'status', e.status, 'capacity', e.capacity, 'available', e.capacity - e.seats_sold - e.seats_reserved,
    'max_seats_per_order', e.max_seats_per_order, 'service_fee_bps', e.service_fee_bps,
    'reservation_minutes', e.reservation_minutes,
    'half_available', greatest(e.half_quota - e.half_sold - e.half_reserved, 0),
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
      where b.event_id = e.id and (b.visibility = 'public' or b.access_code = p_access_code)), '[]'::jsonb)
  ) into v
  from events e where e.slug = p_slug;
  return v;
end $$;

-- Confere cupom sem reservar (para mostrar o desconto em tempo real)
create or replace function api_coupon_check(p_secret text, p_event_id uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c coupons%rowtype;
begin
  perform private.assert_secret(p_secret);
  select * into c from coupons where event_id = p_event_id and upper(code) = upper(trim(p_code));
  if not found or not c.active or (c.valid_until is not null and c.valid_until < now()) then
    return jsonb_build_object('valid', false, 'reason', 'CUPOM_INVALIDO');
  end if;
  if c.max_uses is not null and c.used + c.reserved >= c.max_uses then
    return jsonb_build_object('valid', false, 'reason', 'CUPOM_ESGOTADO');
  end if;
  return jsonb_build_object('valid', true, 'code', upper(c.code), 'kind', c.kind, 'value', c.value, 'owner_name', c.owner_name);
end $$;

create or replace function api_reserve(
  p_secret text, p_event_id uuid, p_items jsonb, p_buyer_name text, p_buyer_email text,
  p_payment_method payment_method default 'pix', p_coupon_code text default null,
  p_access_code text default null, p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.assert_secret(p_secret);
  return reserve_order(p_event_id, p_items, p_buyer_name, p_buyer_email, p_payment_method,
                       p_coupon_code, p_access_code, null, p_idempotency_key);
end $$;

create or replace function api_order(p_secret text, p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform private.assert_secret(p_secret);
  select jsonb_build_object(
    'id', o.id, 'status', o.status, 'buyer_name', o.buyer_name, 'buyer_email', o.buyer_email,
    'seats', o.seats, 'subtotal_cents', o.subtotal_cents, 'discount_cents', o.discount_cents,
    'fee_cents', o.fee_cents, 'total_cents', o.total_cents, 'payment_method', o.payment_method,
    'gateway', o.gateway, 'gateway_payment_id', o.gateway_payment_id,
    'expires_at', o.expires_at, 'paid_at', o.paid_at, 'now', now(),
    'coupon_code', (select upper(code) from coupons where id = o.coupon_id),
    'event', (select jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'venue_name', e.venue_name, 'starts_at', e.starts_at)
                from events e where e.id = o.event_id),
    'items', (select jsonb_agg(jsonb_build_object('variant', oi.variant, 'quantity', oi.quantity, 'seats', oi.seats,
                                                  'unit_price_cents', oi.unit_price_cents, 'batch_name', b.name))
                from order_items oi join batches b on b.id = oi.batch_id where oi.order_id = o.id)
  ) into v
  from orders o where o.id = p_order_id;
  return v;
end $$;

create or replace function api_set_gateway(p_secret text, p_order_id uuid, p_gateway text, p_payment_id text, p_method payment_method)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private.assert_secret(p_secret);
  update orders set gateway = p_gateway, gateway_payment_id = p_payment_id, payment_method = p_method
   where id = p_order_id and status = 'pending';
end $$;

create or replace function api_confirm(p_secret text, p_order_id uuid, p_gateway text default null, p_payment_id text default null)
returns order_status language plpgsql security definer set search_path = public as $$
begin
  perform private.assert_secret(p_secret);
  return confirm_order(p_order_id, p_gateway, p_payment_id);
end $$;

create or replace function api_cancel(p_secret text, p_order_id uuid) returns order_status
language plpgsql security definer set search_path = public as $$
begin
  perform private.assert_secret(p_secret);
  return cancel_order(p_order_id);
end $$;

-- Idempotência de webhook: true = aviso novo, false = já recebido
create or replace function api_webhook_event(p_secret text, p_gateway text, p_event_id text, p_payload jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform private.assert_secret(p_secret);
  insert into payment_events (gateway, external_event_id, payload) values (p_gateway, p_event_id, p_payload)
  on conflict (gateway, external_event_id) do nothing;
  return found;
end $$;

-- -----------------------------------------------------------------------------
-- Ingressos do pedido e transferência
-- -----------------------------------------------------------------------------
create or replace function api_tickets(p_secret text, p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.assert_secret(p_secret);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'code', t.code, 'variant', t.variant, 'holder_name', t.holder_name, 'holder_email', t.holder_email,
      'status', t.status, 'issued_at', extract(epoch from t.issued_at)::bigint, 'used_at', t.used_at)
      order by t.order_item_id, t.id)
    from tickets t where t.order_id = p_order_id), '[]'::jsonb);
end $$;

create or replace function api_transfer(p_secret text, p_order_id uuid, p_ticket_id uuid, p_name text, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.assert_secret(p_secret);
  if not exists (select 1 from tickets where id = p_ticket_id and order_id = p_order_id) then
    raise exception 'INGRESSO_INDISPONIVEL';
  end if;
  perform transfer_ticket(p_ticket_id, p_name, p_email);
  update tickets set issued_at = now() where id = p_ticket_id;
  return api_tickets(p_secret, p_order_id);
end $$;

-- -----------------------------------------------------------------------------
-- Painel do produtor
-- -----------------------------------------------------------------------------
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
                from batches b where b.event_id = e.id),
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

create or replace function api_advance(p_secret text, p_event_id uuid, p_track text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform private.assert_secret(p_secret);
  return advance_batch(p_event_id, p_track, 'manual');
end $$;

-- -----------------------------------------------------------------------------
-- Portaria: lista para uso offline e sincronização
-- -----------------------------------------------------------------------------
create or replace function api_gate_list(p_secret text, p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events%rowtype;
begin
  perform private.assert_secret(p_secret);
  select * into e from events where slug = p_slug;
  if not found then return null; end if;
  return jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug),
    'generated_at', extract(epoch from now())::bigint,
    'tickets', coalesce((select jsonb_agg(jsonb_build_array(t.code, coalesce(t.holder_name, ''), t.variant, t.status = 'used'))
                          from tickets t where t.event_id = e.id and t.status <> 'canceled'), '[]'::jsonb),
    'stats', jsonb_build_object(
      'sold', e.seats_sold,
      'accepted', (select count(*) from checkins where event_id = e.id and result = 'accepted'),
      'duplicate', (select count(*) from checkins where event_id = e.id and result = 'duplicate'))
  );
end $$;

create or replace function api_checkins(p_secret text, p_device_id text, p_scans jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.assert_secret(p_secret);
  return register_checkins(p_device_id, p_scans);
end $$;

-- -----------------------------------------------------------------------------
-- Permissões: só as funções api_* ficam expostas (e todas exigem o segredo)
-- -----------------------------------------------------------------------------
revoke execute on function private.assert_secret(text) from public;
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
