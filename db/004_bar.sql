-- =============================================================================
-- 004: Bar — produtos, estoque, line-up e vendas (PDV)
-- Regra: venda e estoque SEMPRE em unidades (garrafa, lata, long neck).
-- "Caixa" só existe na entrada de estoque: units_per_case converte caixa -> unidades.
-- Venda nunca é bloqueada por estoque (bar não pode parar); estoque pode ficar
-- negativo e o painel alerta para conferência.
-- =============================================================================

create type bar_payment as enum ('pix', 'card', 'cash');

create table bar_products (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events(id),
  name             text not null,
  category         text not null default 'Outros',
  unit_label       text not null default 'unidade',      -- garrafa, lata, long neck
  price_cents      int  not null check (price_cents >= 0),
  cost_cents       int  not null default 0 check (cost_cents >= 0),
  units_per_case   int  not null default 1 check (units_per_case > 0),
  stock_units      int  not null default 0,               -- pode ficar negativo (ver cabeçalho)
  low_stock_units  int  not null default 0 check (low_stock_units >= 0),
  active           boolean not null default true,
  position         int  not null default 0,
  created_at       timestamptz not null default now(),
  unique (event_id, name)
);

create table bar_stock_moves (
  id          bigint generated always as identity primary key,
  product_id  uuid not null references bar_products(id),
  kind        text not null check (kind in ('entrada', 'ajuste', 'cancelamento')),
  units       int  not null,
  cases       int,
  note        text,
  at          timestamptz not null default now()
);

create table lineup (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id),
  artist     text not null,
  stage      text not null default 'Principal',
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  removed    boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index lineup_event_idx on lineup (event_id, starts_at);

create table bar_sales (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events(id),
  client_sale_id  text not null unique,                   -- gerado no aparelho: reenvio offline não duplica
  device_id       text not null,
  payment_method  bar_payment not null,
  total_cents     int  not null check (total_cents >= 0),
  units           int  not null check (units > 0),
  sold_at         timestamptz not null,                   -- hora da venda no aparelho
  received_at     timestamptz not null default now(),
  canceled        boolean not null default false,
  canceled_at     timestamptz
);
create index bar_sales_event_idx on bar_sales (event_id, sold_at);

create table bar_sale_items (
  sale_id           uuid not null references bar_sales(id) on delete cascade,
  product_id        uuid not null references bar_products(id),
  qty               int  not null check (qty > 0),        -- unidades
  unit_price_cents  int  not null check (unit_price_cents >= 0),
  unit_cost_cents   int  not null check (unit_cost_cents >= 0),
  primary key (sale_id, product_id)
);
create index bar_sale_items_product_idx on bar_sale_items (product_id);

alter table bar_products    enable row level security;
alter table bar_stock_moves enable row level security;
alter table lineup          enable row level security;
alter table bar_sales       enable row level security;
alter table bar_sale_items  enable row level security;

-- -----------------------------------------------------------------------------
-- Catálogo para o PDV (produtos ativos + line-up)
-- -----------------------------------------------------------------------------
create or replace function api_bar_catalog(p_secret text, p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events%rowtype;
begin
  perform private.assert_secret(p_secret);
  select * into e from events where slug = p_slug;
  if not found then return null; end if;
  return jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'timezone', e.timezone),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'category', p.category, 'unit_label', p.unit_label,
        'price_cents', p.price_cents, 'stock_units', p.stock_units, 'low_stock_units', p.low_stock_units)
        order by p.category, p.position, p.name)
      from bar_products p where p.event_id = e.id and p.active), '[]'::jsonb),
    'lineup', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'artist', l.artist, 'stage', l.stage, 'starts_at', l.starts_at, 'ends_at', l.ends_at)
        order by l.starts_at)
      from lineup l where l.event_id = e.id and not l.removed), '[]'::jsonb),
    'generated_at', now()
  );
end $$;

-- -----------------------------------------------------------------------------
-- Sincroniza vendas do PDV (idempotente por client_sale_id)
-- p_sales: [{client_sale_id, payment_method, sold_at, items:[{product_id, qty, unit_price_cents}]}]
-- -----------------------------------------------------------------------------
create or replace function api_bar_sync(p_secret text, p_event_id uuid, p_device_id text, p_sales jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s jsonb; it record; v_sale uuid; v_total int; v_units int; v_sold timestamptz;
  v_ok boolean; v_out jsonb := '[]'::jsonb; v_csid text;
begin
  perform private.assert_secret(p_secret);
  if not exists (select 1 from events where id = p_event_id) then raise exception 'EVENTO_NAO_ENCONTRADO'; end if;

  for s in select * from jsonb_array_elements(coalesce(p_sales, '[]'::jsonb)) loop
    v_csid := left(s->>'client_sale_id', 80);
    if v_csid is null then continue; end if;

    if exists (select 1 from bar_sales where client_sale_id = v_csid) then
      v_out := v_out || jsonb_build_object('client_sale_id', v_csid, 'result', 'duplicate');
      continue;
    end if;

    -- Itens válidos: produto do evento, quantidade inteira entre 1 e 500
    select coalesce(bool_and(p.id is not null
                    and case when (i->>'qty') ~ '^[0-9]{1,3}$' then (i->>'qty')::int between 1 and 500 else false end
                    and (i->>'unit_price_cents') ~ '^[0-9]{1,7}$'), false) and count(*) > 0
      into v_ok
      from jsonb_array_elements(coalesce(s->'items', '[]'::jsonb)) i
      left join bar_products p on p.id = (case when (i->>'product_id') ~ '^[0-9a-f-]{36}$' then (i->>'product_id')::uuid end)
                              and p.event_id = p_event_id;
    if not coalesce(v_ok, false) or coalesce(s->>'payment_method', '') not in ('pix', 'card', 'cash') then
      v_out := v_out || jsonb_build_object('client_sale_id', v_csid, 'result', 'invalid');
      continue;
    end if;

    begin
      v_sold := coalesce((s->>'sold_at')::timestamptz, now());
    exception when others then
      v_sold := now();
    end;
    if v_sold > now() + interval '5 minutes' then v_sold := now(); end if;

    select coalesce(sum((i->>'qty')::int * (i->>'unit_price_cents')::int), 0), coalesce(sum((i->>'qty')::int), 0)
      into v_total, v_units
      from jsonb_array_elements(s->'items') i;

    insert into bar_sales (event_id, client_sale_id, device_id, payment_method, total_cents, units, sold_at)
    values (p_event_id, v_csid, left(coalesce(p_device_id, 'pdv'), 60), (s->>'payment_method')::bar_payment, v_total, v_units, v_sold)
    returning id into v_sale;

    -- Agrupa por produto e atualiza estoque em ordem fixa (evita deadlock entre caixas)
    for it in
      select (i->>'product_id')::uuid as product_id, sum((i->>'qty')::int)::int as qty, max((i->>'unit_price_cents')::int) as price
        from jsonb_array_elements(s->'items') i
       group by 1 order by 1
    loop
      update bar_products set stock_units = stock_units - it.qty where id = it.product_id;
      insert into bar_sale_items (sale_id, product_id, qty, unit_price_cents, unit_cost_cents)
      select v_sale, it.product_id, it.qty, it.price, p.cost_cents from bar_products p where p.id = it.product_id;
    end loop;

    v_out := v_out || jsonb_build_object('client_sale_id', v_csid, 'result', 'ok');
  end loop;
  return v_out;
end $$;

-- Cancela uma venda (erro do caixa) e devolve as unidades ao estoque
create or replace function api_bar_cancel(p_secret text, p_client_sale_id text, p_actor text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s bar_sales%rowtype; e events%rowtype;
begin
  perform private.assert_secret(p_secret);
  select * into s from bar_sales where client_sale_id = p_client_sale_id for update;
  if not found then raise exception 'VENDA_NAO_ENCONTRADA'; end if;
  if s.canceled then return jsonb_build_object('ok', true, 'already', true); end if;
  update bar_sales set canceled = true, canceled_at = now() where id = s.id;
  update bar_products p set stock_units = p.stock_units + i.qty
    from bar_sale_items i where i.sale_id = s.id and p.id = i.product_id;
  insert into bar_stock_moves (product_id, kind, units, note)
  select i.product_id, 'cancelamento', i.qty, 'venda ' || left(p_client_sale_id, 12) from bar_sale_items i where i.sale_id = s.id;
  select * into e from events where id = s.event_id;
  insert into audit_log (org_id, action, entity, entity_id, data)
  values (e.org_id, 'bar_sale_canceled', 'bar_sale', s.id, jsonb_build_object('by', p_actor, 'total_cents', s.total_cents, 'units', s.units));
  return jsonb_build_object('ok', true);
end $$;

-- -----------------------------------------------------------------------------
-- Cadastro de produto
-- -----------------------------------------------------------------------------
create or replace function api_bar_product_upsert(
  p_secret text, p_event_id uuid, p_id uuid, p_name text, p_category text, p_unit_label text,
  p_price_cents int, p_cost_cents int, p_units_per_case int, p_low_stock_units int, p_active boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare e events%rowtype; v_id uuid; v_before jsonb;
begin
  perform private.assert_secret(p_secret);
  select * into e from events where id = p_event_id;
  if not found then raise exception 'EVENTO_NAO_ENCONTRADO'; end if;
  if p_name is null or length(trim(p_name)) = 0 or p_price_cents is null or p_price_cents < 0
     or coalesce(p_cost_cents, 0) < 0 or coalesce(p_units_per_case, 1) < 1 or coalesce(p_low_stock_units, 0) < 0 then
    raise exception 'DADOS_INVALIDOS';
  end if;
  begin
    if p_id is null then
      insert into bar_products (event_id, name, category, unit_label, price_cents, cost_cents, units_per_case, low_stock_units, active, position)
      values (p_event_id, trim(p_name), coalesce(nullif(trim(p_category), ''), 'Outros'), coalesce(nullif(trim(p_unit_label), ''), 'unidade'),
              p_price_cents, coalesce(p_cost_cents, 0), coalesce(p_units_per_case, 1), coalesce(p_low_stock_units, 0), coalesce(p_active, true),
              (select coalesce(max(position), 0) + 1 from bar_products where event_id = p_event_id))
      returning id into v_id;
    else
      select to_jsonb(p) - 'stock_units' into v_before from bar_products p where id = p_id and event_id = p_event_id;
      if v_before is null then raise exception 'PRODUTO_NAO_ENCONTRADO'; end if;
      update bar_products set name = trim(p_name), category = coalesce(nullif(trim(p_category), ''), 'Outros'),
             unit_label = coalesce(nullif(trim(p_unit_label), ''), 'unidade'), price_cents = p_price_cents,
             cost_cents = coalesce(p_cost_cents, 0), units_per_case = coalesce(p_units_per_case, 1),
             low_stock_units = coalesce(p_low_stock_units, 0), active = coalesce(p_active, true)
       where id = p_id
      returning id into v_id;
    end if;
  exception when unique_violation then
    raise exception 'PRODUTO_DUPLICADO';
  end;
  insert into audit_log (org_id, action, entity, entity_id, data)
  values (e.org_id, case when p_id is null then 'bar_product_created' else 'bar_product_updated' end, 'bar_product', v_id,
          jsonb_build_object('before', v_before, 'name', p_name, 'price_cents', p_price_cents, 'cost_cents', p_cost_cents,
                             'units_per_case', p_units_per_case, 'active', p_active));
  return v_id;
end $$;

-- Entrada (ou ajuste) de estoque: caixas são convertidas em unidades
create or replace function api_bar_stock_entry(
  p_secret text, p_product_id uuid, p_cases int, p_units int, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p bar_products%rowtype; e events%rowtype; v_units int;
begin
  perform private.assert_secret(p_secret);
  select * into p from bar_products where id = p_product_id for update;
  if not found then raise exception 'PRODUTO_NAO_ENCONTRADO'; end if;
  v_units := coalesce(p_cases, 0) * p.units_per_case + coalesce(p_units, 0);
  if v_units = 0 then raise exception 'QUANTIDADE_INVALIDA'; end if;
  update bar_products set stock_units = stock_units + v_units where id = p.id;
  insert into bar_stock_moves (product_id, kind, units, cases, note)
  values (p.id, case when v_units > 0 then 'entrada' else 'ajuste' end, v_units, p_cases, left(p_note, 200));
  select * into e from events where id = p.event_id;
  insert into audit_log (org_id, action, entity, entity_id, data)
  values (e.org_id, 'bar_stock_entry', 'bar_product', p.id,
          jsonb_build_object('cases', p_cases, 'units', p_units, 'total_units', v_units, 'note', p_note));
  return jsonb_build_object('ok', true, 'units', v_units, 'stock_units', p.stock_units + v_units);
end $$;

-- -----------------------------------------------------------------------------
-- Line-up (horários reais podem ser corrigidos durante a festa)
-- -----------------------------------------------------------------------------
create or replace function api_lineup_upsert(
  p_secret text, p_event_id uuid, p_id uuid, p_artist text, p_stage text, p_starts_at timestamptz, p_ends_at timestamptz
) returns uuid
language plpgsql security definer set search_path = public as $$
declare e events%rowtype; v_id uuid;
begin
  perform private.assert_secret(p_secret);
  select * into e from events where id = p_event_id;
  if not found then raise exception 'EVENTO_NAO_ENCONTRADO'; end if;
  if p_artist is null or length(trim(p_artist)) = 0 or p_starts_at is null or p_ends_at is null then raise exception 'DADOS_INVALIDOS'; end if;
  if p_ends_at <= p_starts_at then raise exception 'HORARIO_INVALIDO'; end if;
  if p_id is null then
    insert into lineup (event_id, artist, stage, starts_at, ends_at)
    values (p_event_id, trim(p_artist), coalesce(nullif(trim(p_stage), ''), 'Principal'), p_starts_at, p_ends_at)
    returning id into v_id;
  else
    update lineup set artist = trim(p_artist), stage = coalesce(nullif(trim(p_stage), ''), 'Principal'),
           starts_at = p_starts_at, ends_at = p_ends_at, removed = false
     where id = p_id and event_id = p_event_id
    returning id into v_id;
    if v_id is null then raise exception 'SHOW_NAO_ENCONTRADO'; end if;
  end if;
  insert into audit_log (org_id, action, entity, entity_id, data)
  values (e.org_id, 'lineup_saved', 'lineup', v_id,
          jsonb_build_object('artist', p_artist, 'stage', p_stage, 'starts_at', p_starts_at, 'ends_at', p_ends_at));
  return v_id;
end $$;

create or replace function api_lineup_remove(p_secret text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l lineup%rowtype; e events%rowtype;
begin
  perform private.assert_secret(p_secret);
  update lineup set removed = true where id = p_id returning * into l;
  if l.id is null then raise exception 'SHOW_NAO_ENCONTRADO'; end if;
  select * into e from events where id = l.event_id;
  insert into audit_log (org_id, action, entity, entity_id, data)
  values (e.org_id, 'lineup_removed', 'lineup', l.id, jsonb_build_object('artist', l.artist));
  return jsonb_build_object('ok', true);
end $$;

-- -----------------------------------------------------------------------------
-- Painel do bar: tudo em unidades. Cruza horário da venda com o line-up.
-- -----------------------------------------------------------------------------
create or replace function api_bar_dashboard(p_secret text, p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events%rowtype; v jsonb;
begin
  perform private.assert_secret(p_secret);
  select * into e from events where slug = p_slug;
  if not found then return null; end if;

  with s as (select * from bar_sales where event_id = e.id and not canceled),
       i as (select i.*, s.sold_at, s.payment_method from bar_sale_items i join s on s.id = i.sale_id),
       l as (select * from lineup where event_id = e.id and not removed)
  select jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'timezone', e.timezone, 'starts_at', e.starts_at),
    'summary', (select jsonb_build_object(
        'revenue_cents', coalesce(sum(i.qty * i.unit_price_cents), 0),
        'cost_cents', coalesce(sum(i.qty * i.unit_cost_cents), 0),
        'units', coalesce(sum(i.qty), 0),
        'sales', (select count(*) from s),
        'canceled_sales', (select count(*) from bar_sales where event_id = e.id and canceled),
        'first_sale', (select min(sold_at) from s), 'last_sale', (select max(sold_at) from s)) from i),
    'tickets_cents', (select coalesce(sum(total_cents), 0) from orders where event_id = e.id and status = 'paid'),
    'by_payment', coalesce((select jsonb_agg(jsonb_build_object('method', m, 'sales', n, 'revenue_cents', r) order by r desc)
        from (select payment_method m, count(*) n, sum(total_cents) r from s group by 1) x), '[]'::jsonb),
    'by_hour', coalesce((select jsonb_agg(jsonb_build_object('hour', h, 'units', u, 'revenue_cents', r) order by h)
        from (select to_char(date_trunc('hour', sold_at at time zone e.timezone), 'YYYY-MM-DD"T"HH24:00') h,
                     sum(qty) u, sum(qty * unit_price_cents) r from i group by 1) x), '[]'::jsonb),
    'ranking', coalesce((select jsonb_agg(jsonb_build_object(
        'product_id', p.id, 'name', p.name, 'category', p.category, 'unit_label', p.unit_label, 'units_per_case', p.units_per_case,
        'units', x.u, 'revenue_cents', x.r, 'profit_cents', x.r - x.c) order by x.u desc, x.r desc)
        from (select product_id, sum(qty) u, sum(qty * unit_price_cents) r, sum(qty * unit_cost_cents) c from i group by 1) x
        join bar_products p on p.id = x.product_id), '[]'::jsonb),
    'shows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'artist', l.artist, 'stage', l.stage, 'starts_at', l.starts_at, 'ends_at', l.ends_at,
        'units', (select coalesce(sum(qty), 0) from i where i.sold_at >= l.starts_at and i.sold_at < l.ends_at),
        'revenue_cents', (select coalesce(sum(qty * unit_price_cents), 0) from i where i.sold_at >= l.starts_at and i.sold_at < l.ends_at),
        'sales', (select count(*) from s where s.sold_at >= l.starts_at and s.sold_at < l.ends_at),
        'top', coalesce((select jsonb_agg(t order by (t->>'units')::int desc) from (
            select jsonb_build_object('name', p.name, 'unit_label', p.unit_label, 'units_per_case', p.units_per_case,
                                      'units', sum(i.qty), 'revenue_cents', sum(i.qty * i.unit_price_cents)) t
              from i join bar_products p on p.id = i.product_id
             where i.sold_at >= l.starts_at and i.sold_at < l.ends_at
             group by p.id order by sum(i.qty) desc limit 8) tt), '[]'::jsonb))
        order by l.starts_at) from l), '[]'::jsonb),
    'outside_shows', (select jsonb_build_object('units', coalesce(sum(qty), 0), 'revenue_cents', coalesce(sum(qty * unit_price_cents), 0))
        from i where not exists (select 1 from l where i.sold_at >= l.starts_at and i.sold_at < l.ends_at)),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'category', p.category, 'unit_label', p.unit_label, 'price_cents', p.price_cents,
        'cost_cents', p.cost_cents, 'units_per_case', p.units_per_case, 'stock_units', p.stock_units,
        'low_stock_units', p.low_stock_units, 'active', p.active,
        'sold_units', (select coalesce(sum(qty), 0) from i where i.product_id = p.id),
        'entered_units', (select coalesce(sum(units), 0) from bar_stock_moves m where m.product_id = p.id and m.kind in ('entrada', 'ajuste')))
        order by p.active desc, p.category, p.position, p.name)
        from bar_products p where p.event_id = e.id), '[]'::jsonb),
    'lineup', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'artist', l.artist, 'stage', l.stage,
        'starts_at', l.starts_at, 'ends_at', l.ends_at) order by l.starts_at) from l), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(r order by r->>'received_at' desc) from (
        select jsonb_build_object('client_sale_id', b.client_sale_id, 'sold_at', b.sold_at, 'received_at', b.received_at, 'device_id', b.device_id,
               'payment_method', b.payment_method, 'total_cents', b.total_cents, 'units', b.units, 'canceled', b.canceled,
               'items', (select string_agg(it.qty || '× ' || p.name, ', ' order by it.qty desc)
                           from bar_sale_items it join bar_products p on p.id = it.product_id where it.sale_id = b.id)) r
          from bar_sales b where b.event_id = e.id order by b.received_at desc, b.sold_at desc limit 12) rr), '[]'::jsonb)
  ) into v;
  return v;
end $$;
