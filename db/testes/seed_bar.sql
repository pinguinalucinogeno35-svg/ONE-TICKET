-- Dados simulados do bar para a demo (produtos, line-up e uma noite de vendas).
-- Uso: psql -v slug=festa-demo -f seed_bar.sql   (no Supabase, troque :'slug' pelo texto)
do $$
declare
  v_slug text := current_setting('seed.slug', true);
  e events%rowtype;
  v_local timestamp;          -- 23:00 do dia do evento, horário local
  shows jsonb := '[
    {"artist":"DJ Lua","stage":"Principal","from":0,"to":90,
     "t":{"Absolut 1L":18,"Tanqueray 750ml":8,"Red Label 1L":6,"Chandon Brut":4,"Red Bull 250ml":210,"Heineken long neck":260,"Água 500ml":90,"Coca-Cola lata":60}},
    {"artist":"Guilherme","stage":"Principal","from":90,"to":180,
     "t":{"Absolut 1L":50,"Tanqueray 750ml":22,"Red Label 1L":15,"Chandon Brut":12,"Red Bull 250ml":480,"Heineken long neck":420,"Água 500ml":140,"Coca-Cola lata":80}},
    {"artist":"Banda Maré","stage":"Principal","from":180,"to":270,
     "t":{"Absolut 1L":34,"Tanqueray 750ml":17,"Red Label 1L":20,"Chandon Brut":9,"Red Bull 250ml":330,"Heineken long neck":380,"Água 500ml":160,"Coca-Cola lata":70}},
    {"artist":"DJ Kaio","stage":"Principal","from":270,"to":360,
     "t":{"Absolut 1L":21,"Tanqueray 750ml":6,"Red Label 1L":8,"Chandon Brut":3,"Red Bull 250ml":260,"Heineken long neck":150,"Água 500ml":210,"Coca-Cola lata":50}}
  ]';
  sh jsonb; k text; v_left int; v_qty int; v_sale uuid; v_at timestamptz; v_p bar_products%rowtype;
  v_n int := 0; v_methods bar_payment[] := array['pix','pix','pix','pix','card','card','card','card','cash','cash']::bar_payment[];
begin
  perform setseed(0.42);
  select * into e from events where slug = coalesce(v_slug, 'festa-demo');
  if not found then raise exception 'evento % não encontrado', v_slug; end if;
  if exists (select 1 from bar_products where event_id = e.id) then
    raise notice 'bar já tem dados para %, nada feito', e.slug; return;
  end if;
  v_local := date_trunc('day', e.starts_at at time zone e.timezone) + interval '23 hours';

  insert into bar_products (event_id, name, category, unit_label, price_cents, cost_cents, units_per_case, low_stock_units, position) values
    (e.id, 'Absolut 1L',         'Destilados',  'garrafa',   25000,  9000, 12,  24, 1),
    (e.id, 'Tanqueray 750ml',    'Destilados',  'garrafa',   28000, 11000,  6,  12, 2),
    (e.id, 'Red Label 1L',       'Destilados',  'garrafa',   30000, 12000, 12,  12, 3),
    (e.id, 'Chandon Brut',       'Espumantes',  'garrafa',   22000,  8500,  6,  12, 4),
    (e.id, 'Red Bull 250ml',     'Energéticos', 'lata',       1800,   600, 24, 240, 5),
    (e.id, 'Heineken long neck', 'Cervejas',    'long neck',  1500,   500, 24, 240, 6),
    (e.id, 'Água 500ml',         'Sem álcool',  'garrafa',     600,   150, 12, 144, 7),
    (e.id, 'Coca-Cola lata',     'Sem álcool',  'lata',        800,   300, 12,  96, 8);

  -- Entrada inicial de estoque, em caixas (convertidas para unidades)
  with c(name, cases) as (values ('Absolut 1L', 15), ('Tanqueray 750ml', 10), ('Red Label 1L', 6), ('Chandon Brut', 8),
                                 ('Red Bull 250ml', 60), ('Heineken long neck', 80), ('Água 500ml', 60), ('Coca-Cola lata', 40)),
       m as (insert into bar_stock_moves (product_id, kind, units, cases, note)
             select p.id, 'entrada', c.cases * p.units_per_case, c.cases, 'estoque inicial'
               from c join bar_products p on p.name = c.name and p.event_id = e.id
             returning product_id, units)
  update bar_products p set stock_units = m.units from m where p.id = m.product_id;

  for sh in select * from jsonb_array_elements(shows) loop
    insert into lineup (event_id, artist, stage, starts_at, ends_at)
    values (e.id, sh->>'artist', sh->>'stage',
            (v_local + ((sh->>'from')::int || ' minutes')::interval) at time zone e.timezone,
            (v_local + ((sh->>'to')::int || ' minutes')::interval) at time zone e.timezone);

    -- Vende cada meta de unidades em vendas pequenas espalhadas pelo show
    for k in select jsonb_object_keys(sh->'t') loop
      select * into v_p from bar_products where event_id = e.id and name = k;
      v_left := (sh->'t'->>k)::int;
      while v_left > 0 loop
        v_qty := least(v_left, case when v_p.units_per_case >= 24 then 1 + floor(random() * 6)::int
                                    when v_p.category = 'Sem álcool' then 1 + floor(random() * 3)::int
                                    else 1 + floor(random() * 1.3)::int end);
        v_at := (v_local + (((sh->>'from')::int + random() * ((sh->>'to')::int - (sh->>'from')::int)) || ' minutes')::interval) at time zone e.timezone;
        v_n := v_n + 1;
        insert into bar_sales (event_id, client_sale_id, device_id, payment_method, total_cents, units, sold_at)
        values (e.id, 'seed-' || v_n, 'caixa-' || (1 + floor(random() * 3))::int, v_methods[1 + floor(random() * 10)::int],
                v_qty * v_p.price_cents, v_qty, v_at)
        returning id into v_sale;
        insert into bar_sale_items (sale_id, product_id, qty, unit_price_cents, unit_cost_cents)
        values (v_sale, v_p.id, v_qty, v_p.price_cents, v_p.cost_cents);
        update bar_products set stock_units = stock_units - v_qty where id = v_p.id;
        v_left := v_left - v_qty;
      end loop;
    end loop;
  end loop;
  raise notice 'bar simulado: % vendas', v_n;
end $$;
