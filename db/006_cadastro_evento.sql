-- =============================================================================
-- 006: cadastro de eventos pelo painel
-- O produtor cria e edita eventos (dados da página pública), publica, pausa e
-- encerra. O "evento da noite" (portaria, bar e endereço principal) fica
-- guardado no banco, em private.app_config ('current_event'), e substitui a
-- variável EVENT_SLUG (que continua como reserva enquanto ninguém escolher).
-- =============================================================================

alter table events
  add column description    text,
  add column image_url      text,
  add column ends_at        timestamptz,
  add column address        text,
  add column city           text,
  add column state          text,
  add column age_rating     text,
  add column cancel_policy  text,
  add column producer_name  text,
  add column producer_about text,
  add column contact        text,                 -- e-mail ou WhatsApp do "Fale com o produtor"
  add column published_at   timestamptz,
  add constraint event_ends_after_start check (ends_at is null or ends_at > starts_at),
  add constraint event_age_rating check (age_rating is null or age_rating in ('L', '10', '12', '14', '16', '18')),
  add constraint event_image_https check (image_url is null or image_url ~ '^https://');

-- Evento da noite: o que a portaria, o bar e o endereço principal usam
create or replace function api_current_event(p_secret text) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform private.assert_secret(p_secret);
  return (select e.slug from private.app_config c join events e on e.id::text = c.value where c.key = 'current_event');
end $$;

create or replace function api_event_set_current(p_secret text, p_id uuid, p_actor text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events%rowtype;
begin
  perform private.assert_secret(p_secret);
  select * into e from events where id = p_id;
  if not found then raise exception 'EVENTO_NAO_ENCONTRADO'; end if;
  insert into private.app_config (key, value) values ('current_event', p_id::text)
  on conflict (key) do update set value = excluded.value;
  insert into audit_log (org_id, action, entity, entity_id, data)
  values (e.org_id, 'event_set_current', 'event', p_id, jsonb_build_object('by', p_actor));
  return jsonb_build_object('ok', true, 'slug', e.slug);
end $$;

-- Lista de eventos da produtora (a do evento de referência)
create or replace function api_events_list(p_secret text, p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_current text;
begin
  perform private.assert_secret(p_secret);
  select org_id into v_org from events where slug = p_slug;
  if v_org is null then select id into v_org from organizations order by created_at limit 1; end if;
  select value into v_current from private.app_config where key = 'current_event';
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'name', e.name, 'slug', e.slug, 'status', e.status, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
      'venue_name', e.venue_name, 'city', e.city, 'capacity', e.capacity, 'seats_sold', e.seats_sold,
      'image_url', e.image_url, 'is_current', e.id::text = v_current,
      'active_batches', (select count(*) from batches b where b.event_id = e.id and b.status = 'active'))
      order by e.starts_at desc)
    from events e where e.org_id = v_org), '[]'::jsonb);
end $$;

-- Dados completos para o formulário
create or replace function api_event_detail(p_secret text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events%rowtype;
begin
  perform private.assert_secret(p_secret);
  select * into e from events where id = p_id;
  if not found then return null; end if;
  return to_jsonb(e) - 'org_id' || jsonb_build_object(
    'is_current', exists (select 1 from private.app_config where key = 'current_event' and value = e.id::text),
    'has_orders', exists (select 1 from orders where event_id = e.id),
    'active_batches', (select count(*) from batches b where b.event_id = e.id and b.status = 'active'),
    'batches', (select count(*) from batches b where b.event_id = e.id));
end $$;

-- Cria (p_id nulo) ou edita um evento. p_data traz os campos do formulário.
-- p_slug é o evento de referência, usado só para saber a produtora no cadastro novo.
create or replace function api_event_save(
  p_secret text, p_slug text, p_id uuid, p_data jsonb, p_actor text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e        events%rowtype;
  v_org    uuid;
  v_id     uuid;
  v_name   text := trim(coalesce(p_data->>'name', ''));
  v_slug   text := lower(trim(coalesce(p_data->>'slug', '')));
  v_start  timestamptz := nullif(p_data->>'starts_at', '')::timestamptz;
  v_end    timestamptz := nullif(p_data->>'ends_at', '')::timestamptz;
  v_cap    int := nullif(p_data->>'capacity', '')::int;
  v_half   int := nullif(p_data->>'half_quota', '')::int;
  v_max    int := coalesce(nullif(p_data->>'max_seats_per_order', '')::int, 8);
  v_age    text := nullif(trim(coalesce(p_data->>'age_rating', '')), '');
  v_img    text := nullif(trim(coalesce(p_data->>'image_url', '')), '');
begin
  perform private.assert_secret(p_secret);
  if length(v_name) < 3 or length(v_name) > 120 or v_start is null or v_cap is null or v_cap <= 0
     or v_max < 1 or v_max > 20 then
    raise exception 'DADOS_INVALIDOS';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) < 3 or length(v_slug) > 60 then raise exception 'ENDERECO_INVALIDO'; end if;
  if v_end is not null and v_end <= v_start then raise exception 'DATA_INVALIDA'; end if;
  if v_age is not null and v_age not in ('L', '10', '12', '14', '16', '18') then raise exception 'DADOS_INVALIDOS'; end if;
  if v_img is not null and v_img !~ '^https://' then raise exception 'IMAGEM_INVALIDA'; end if;
  -- Meia-entrada: sem valor informado, 40% da capacidade (Lei 12.933/2013)
  v_half := coalesce(v_half, floor(v_cap * 0.4)::int);
  if v_half < 0 or v_half > v_cap then raise exception 'COTA_MEIA_INVALIDA'; end if;

  if p_id is null then
    select org_id into v_org from events where slug = p_slug;
    if v_org is null then select id into v_org from organizations order by created_at limit 1; end if;
    if v_org is null then raise exception 'EVENTO_NAO_ENCONTRADO'; end if;
    if exists (select 1 from events where org_id = v_org and slug = v_slug) then raise exception 'ENDERECO_DUPLICADO'; end if;
    insert into events (org_id, name, slug, starts_at, capacity, half_quota, max_seats_per_order, status)
    values (v_org, v_name, v_slug, v_start, v_cap, v_half, v_max, 'draft')
    returning * into e;
  else
    select * into e from events where id = p_id for update;          -- trava do evento (regra de ouro da 001)
    if not found then raise exception 'EVENTO_NAO_ENCONTRADO'; end if;
    if v_cap < e.seats_sold + e.seats_reserved then raise exception 'CAPACIDADE_ABAIXO_DO_VENDIDO'; end if;
    if v_half < e.half_sold + e.half_reserved then raise exception 'COTA_MEIA_INVALIDA'; end if;
    if v_slug <> e.slug then
      -- Link já divulgado não muda depois que alguém comprou
      if exists (select 1 from orders where event_id = e.id) then raise exception 'ENDERECO_COM_VENDAS'; end if;
      if exists (select 1 from events where org_id = e.org_id and slug = v_slug and id <> e.id) then raise exception 'ENDERECO_DUPLICADO'; end if;
    end if;
  end if;

  update events set
    name = v_name, slug = v_slug, starts_at = v_start, ends_at = v_end, capacity = v_cap, half_quota = v_half,
    max_seats_per_order = v_max, age_rating = v_age, image_url = v_img,
    venue_name     = nullif(trim(coalesce(p_data->>'venue_name', '')), ''),
    address        = nullif(trim(coalesce(p_data->>'address', '')), ''),
    city           = nullif(trim(coalesce(p_data->>'city', '')), ''),
    state          = nullif(upper(trim(coalesce(p_data->>'state', ''))), ''),
    description    = nullif(trim(coalesce(p_data->>'description', '')), ''),
    cancel_policy  = nullif(trim(coalesce(p_data->>'cancel_policy', '')), ''),
    producer_name  = nullif(trim(coalesce(p_data->>'producer_name', '')), ''),
    producer_about = nullif(trim(coalesce(p_data->>'producer_about', '')), ''),
    contact        = nullif(trim(coalesce(p_data->>'contact', '')), '')
  where id = e.id
  returning id into v_id;

  insert into audit_log (org_id, action, entity, entity_id, data)
  values (e.org_id, case when p_id is null then 'event_created' else 'event_updated' end, 'event', v_id,
          jsonb_build_object('by', p_actor, 'name', v_name, 'slug', v_slug, 'capacity', v_cap,
                             'before', case when p_id is null then null else jsonb_build_object(
                               'name', e.name, 'slug', e.slug, 'starts_at', e.starts_at, 'capacity', e.capacity, 'half_quota', e.half_quota) end));
  return v_id;
end $$;

-- Publicar, pausar, encerrar ou voltar para rascunho
create or replace function api_event_set_status(p_secret text, p_id uuid, p_status event_status, p_actor text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events%rowtype;
begin
  perform private.assert_secret(p_secret);
  select * into e from events where id = p_id for update;
  if not found then raise exception 'EVENTO_NAO_ENCONTRADO'; end if;
  if p_status = 'on_sale' and not exists (
       select 1 from batches b where b.event_id = e.id and b.status = 'active' and exists (select 1 from offers o where o.batch_id = b.id)) then
    raise exception 'SEM_LOTE_ATIVO';
  end if;
  if p_status = 'draft' and exists (select 1 from orders where event_id = e.id) then raise exception 'EVENTO_COM_VENDAS'; end if;
  update events set status = p_status,
         published_at = case when p_status = 'on_sale' then coalesce(published_at, now()) else published_at end
   where id = p_id;
  insert into audit_log (org_id, action, entity, entity_id, data)
  values (e.org_id, 'event_status', 'event', p_id, jsonb_build_object('by', p_actor, 'from', e.status, 'to', p_status));
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

-- Página do evento: mesma de antes + os campos novos
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
      where b.event_id = e.id and (b.visibility = 'public' or b.access_code = p_access_code)), '[]'::jsonb)
  ) into v
  from events e where e.slug = p_slug;
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
