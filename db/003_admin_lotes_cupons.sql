-- =============================================================================
-- 003: administração pelo painel — lotes, preços e cupons
-- Todas exigem o segredo do servidor. Alterações de lote travam o evento,
-- como qualquer outra mudança de capacidade (regra de ouro da 001).
-- Pedidos já reservados não mudam: o preço fica congelado em order_items.
-- =============================================================================

-- Dados completos para as telas de administração
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
        'offers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'variant', o.variant, 'price_cents', o.price_cents)
                   order by array_position(array['inteira','meia','casadinha']::offer_variant[], o.variant))
                 from offers o where o.batch_id = b.id), '[]'::jsonb))
        order by b.track, b.position) from batches b where b.event_id = e.id), '[]'::jsonb),
    'coupons', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'code', c.code, 'owner_name', c.owner_name, 'owner_kind', c.owner_kind, 'kind', c.kind,
        'value', c.value, 'max_uses', c.max_uses, 'used', c.used, 'reserved', c.reserved,
        'valid_until', c.valid_until, 'active', c.active,
        'seats', (select coalesce(sum(o.seats), 0) from orders o where o.coupon_id = c.id and o.status = 'paid'),
        'revenue_cents', (select coalesce(sum(o.total_cents), 0) from orders o where o.coupon_id = c.id and o.status = 'paid'))
        order by c.active desc, c.created_at) from coupons c where c.event_id = e.id), '[]'::jsonb)
  );
end $$;

-- Edita nome, quantidade e data de virada de um lote
create or replace function api_batch_update(
  p_secret text, p_batch_id uuid, p_name text, p_quantity int, p_ends_at timestamptz, p_actor text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b batches%rowtype; e events%rowtype;
begin
  perform private.assert_secret(p_secret);
  select * into b from batches where id = p_batch_id;
  if not found then raise exception 'LOTE_NAO_ENCONTRADO'; end if;
  select * into e from events where id = b.event_id for update;           -- trava do evento
  select * into b from batches where id = p_batch_id for update;
  if p_quantity is null or p_quantity < b.sold + b.reserved then raise exception 'QUANTIDADE_ABAIXO_DO_VENDIDO'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'DADOS_INVALIDOS'; end if;
  update batches set name = trim(p_name), quantity = p_quantity, ends_at = p_ends_at where id = p_batch_id;
  -- Se o lote ativo ficou cheio com a nova quantidade, vira na hora
  if b.status = 'active' and b.sold + b.reserved >= p_quantity then
    perform advance_batch(b.event_id, b.track, 'esgotado');
  end if;
  insert into audit_log (org_id, action, entity, entity_id, data)
  values (e.org_id, 'batch_updated', 'batch', p_batch_id,
          jsonb_build_object('by', p_actor, 'before', jsonb_build_object('name', b.name, 'quantity', b.quantity, 'ends_at', b.ends_at),
                             'after', jsonb_build_object('name', p_name, 'quantity', p_quantity, 'ends_at', p_ends_at)));
  return jsonb_build_object('ok', true);
end $$;

-- Cria um lote novo no fim da trilha (ex.: 5º lote, ou a primeira promoção)
create or replace function api_batch_create(
  p_secret text, p_event_id uuid, p_track text, p_name text, p_quantity int,
  p_price_inteira int, p_price_meia int, p_price_casadinha int,
  p_ends_at timestamptz default null, p_visibility batch_visibility default 'public', p_access_code text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare e events%rowtype; v_id uuid; v_pos int; v_has_active boolean;
begin
  perform private.assert_secret(p_secret);
  select * into e from events where id = p_event_id for update;
  if not found then raise exception 'EVENTO_NAO_ENCONTRADO'; end if;
  if p_quantity is null or p_quantity <= 0 or p_name is null or length(trim(p_name)) = 0 or p_price_inteira is null or p_price_inteira < 0 then
    raise exception 'DADOS_INVALIDOS';
  end if;
  select coalesce(max(position), 0) + 1, bool_or(status = 'active') into v_pos, v_has_active
    from batches where event_id = p_event_id and track = p_track;
  insert into batches (event_id, track, position, name, quantity, status, ends_at, opened_at, visibility, access_code)
  values (p_event_id, p_track, v_pos, trim(p_name), p_quantity,
          case when coalesce(v_has_active, false) then 'scheduled' else 'active' end::batch_status,
          p_ends_at, case when coalesce(v_has_active, false) then null else now() end,
          p_visibility, case when p_visibility = 'link' then upper(nullif(trim(p_access_code), '')) end)
  returning id into v_id;
  insert into offers (batch_id, variant, price_cents, seats_per_unit) values (v_id, 'inteira', p_price_inteira, 1);
  if p_price_meia is not null then
    insert into offers (batch_id, variant, price_cents, seats_per_unit) values (v_id, 'meia', p_price_meia, 1);
  end if;
  if p_price_casadinha is not null then
    insert into offers (batch_id, variant, price_cents, seats_per_unit) values (v_id, 'casadinha', p_price_casadinha, 2);
  end if;
  insert into audit_log (org_id, action, entity, entity_id, data)
  values (e.org_id, 'batch_created', 'batch', v_id, jsonb_build_object('track', p_track, 'name', p_name, 'quantity', p_quantity));
  return v_id;
end $$;

-- Define o preço de uma modalidade no lote (cria a modalidade se não existir)
create or replace function api_offer_set(
  p_secret text, p_batch_id uuid, p_variant offer_variant, p_price_cents int, p_actor text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b batches%rowtype; e events%rowtype; v_old int;
begin
  perform private.assert_secret(p_secret);
  select * into b from batches where id = p_batch_id;
  if not found then raise exception 'LOTE_NAO_ENCONTRADO'; end if;
  select * into e from events where id = b.event_id for update;
  if p_price_cents is null or p_price_cents < 0 or p_price_cents > 10000000 then raise exception 'PRECO_INVALIDO'; end if;
  select price_cents into v_old from offers where batch_id = p_batch_id and variant = p_variant;
  insert into offers (batch_id, variant, price_cents, seats_per_unit)
  values (p_batch_id, p_variant, p_price_cents, case when p_variant = 'casadinha' then 2 else 1 end)
  on conflict (batch_id, variant) do update set price_cents = excluded.price_cents;
  if v_old is distinct from p_price_cents then
    insert into audit_log (org_id, action, entity, entity_id, data)
    values (e.org_id, 'price_changed', 'batch', p_batch_id,
            jsonb_build_object('by', p_actor, 'variant', p_variant, 'from', v_old, 'to', p_price_cents));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Cria ou edita cupom
create or replace function api_coupon_upsert(
  p_secret text, p_event_id uuid, p_id uuid, p_code text, p_owner_name text, p_owner_kind coupon_owner,
  p_kind coupon_kind, p_value int, p_max_uses int, p_valid_until timestamptz, p_active boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare c coupons%rowtype; v_id uuid; v_code text := upper(regexp_replace(coalesce(p_code, ''), '[[:space:]]', '', 'g'));
begin
  perform private.assert_secret(p_secret);
  if v_code !~ '^[A-Z0-9_-]{3,30}$' then raise exception 'CODIGO_INVALIDO'; end if;
  if p_owner_name is null or length(trim(p_owner_name)) = 0 then raise exception 'DADOS_INVALIDOS'; end if;
  if p_kind = 'percent' and (p_value is null or p_value < 1 or p_value > 100) then raise exception 'VALOR_INVALIDO'; end if;
  if p_kind = 'fixed' and (p_value is null or p_value < 1) then raise exception 'VALOR_INVALIDO'; end if;
  if p_max_uses is not null and p_max_uses < 1 then raise exception 'VALOR_INVALIDO'; end if;
  if exists (select 1 from coupons where event_id = p_event_id and upper(code) = v_code and id is distinct from p_id) then
    raise exception 'CUPOM_DUPLICADO';
  end if;

  if p_id is null then
    insert into coupons (event_id, code, owner_name, owner_kind, kind, value, max_uses, valid_until, active)
    values (p_event_id, v_code, trim(p_owner_name), p_owner_kind, p_kind,
            case when p_kind = 'courtesy' then 0 else p_value end, p_max_uses, p_valid_until, coalesce(p_active, true))
    returning id into v_id;
  else
    select * into c from coupons where id = p_id and event_id = p_event_id for update;
    if not found then raise exception 'CUPOM_INVALIDO'; end if;
    if p_max_uses is not null and p_max_uses < c.used + c.reserved then raise exception 'LIMITE_ABAIXO_DO_USO'; end if;
    update coupons set code = v_code, owner_name = trim(p_owner_name), owner_kind = p_owner_kind, kind = p_kind,
           value = case when p_kind = 'courtesy' then 0 else p_value end, max_uses = p_max_uses,
           valid_until = p_valid_until, active = coalesce(p_active, c.active)
     where id = p_id;
    v_id := p_id;
  end if;
  insert into audit_log (action, entity, entity_id, data)
  values (case when p_id is null then 'coupon_created' else 'coupon_updated' end, 'coupon', v_id,
          jsonb_build_object('code', v_code, 'kind', p_kind, 'value', p_value, 'max_uses', p_max_uses));
  return v_id;
end $$;

create or replace function api_coupon_set_active(p_secret text, p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.assert_secret(p_secret);
  update coupons set active = p_active where id = p_id;
  insert into audit_log (action, entity, entity_id, data)
  values ('coupon_toggled', 'coupon', p_id, jsonb_build_object('active', p_active));
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
