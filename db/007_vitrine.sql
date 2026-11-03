-- =============================================================================
-- 007: vitrine pública (página inicial)
-- Lista os eventos publicados (à venda, pausados e encerrados) para o público
-- escolher a festa. Rascunho nunca aparece. O produtor pode tirar um evento da
-- vitrine (evento privado: só quem tem o link compra).
-- =============================================================================

alter table events add column listed boolean not null default true;

-- p_past = false: próximos (ainda não terminaram). true: já aconteceram.
-- Sem término informado, o evento conta como terminado 12 horas depois do início.
create or replace function api_public_events(p_secret text, p_past boolean default false, p_limit int default 60) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.assert_secret(p_secret);
  return coalesce((
    select jsonb_agg(x.j order by
             case when p_past then null else x.starts_at end asc,
             case when p_past then x.starts_at end desc)
      from (
        select e.starts_at, jsonb_build_object(
          'id', e.id, 'name', e.name, 'slug', e.slug, 'status', e.status, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
          'venue_name', e.venue_name, 'city', e.city, 'state', e.state, 'image_url', e.image_url,
          'age_rating', e.age_rating, 'producer_name', e.producer_name,
          'sold_out', e.capacity - e.seats_sold - e.seats_reserved <= 0,
          -- menor preço de inteira à venda agora (só lotes públicos e ativos)
          'min_price_cents', (select min(o.price_cents) from offers o join batches b on b.id = o.batch_id
                               where b.event_id = e.id and b.status = 'active' and b.visibility = 'public'
                                 and o.variant = 'inteira')) j
          from events e
         where e.status in ('on_sale', 'paused', 'closed') and e.listed
           and (coalesce(e.ends_at, e.starts_at + interval '12 hours') < now()) = p_past
         order by case when p_past then e.starts_at end desc, e.starts_at
         limit greatest(1, least(coalesce(p_limit, 60), 200))
      ) x), '[]'::jsonb);
end $$;

-- Cadastro: grava também "mostrar na vitrine" (o resto do api_event_save da 006 não muda)
create or replace function api_event_set_listed(p_secret text, p_id uuid, p_listed boolean, p_actor text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events%rowtype;
begin
  perform private.assert_secret(p_secret);
  select * into e from events where id = p_id;
  if not found then raise exception 'EVENTO_NAO_ENCONTRADO'; end if;
  update events set listed = coalesce(p_listed, true) where id = p_id;
  insert into audit_log (org_id, action, entity, entity_id, data)
  values (e.org_id, 'event_listed', 'event', p_id, jsonb_build_object('by', p_actor, 'listed', p_listed));
  return jsonb_build_object('ok', true, 'listed', coalesce(p_listed, true));
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
