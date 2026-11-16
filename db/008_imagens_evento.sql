-- =============================================================================
-- 008: imagens do evento (capa e galeria) enviadas pelo painel
-- As imagens ficam no próprio banco (bytea), já reduzidas no navegador
-- (até 1600 px, JPEG ~ 200-500 KB). O app serve em /imagem/<id> com cache longo.
-- Remover é soft delete (removed = true), como no line-up.
-- =============================================================================

create table if not exists event_images (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id),
  kind        text not null check (kind in ('cover', 'gallery')),
  position    int not null default 0,
  mime        text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes       int not null,
  data        bytea not null,
  removed     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists event_images_event on event_images (event_id) where not removed;
alter table event_images enable row level security; -- sem policies: só as funções acessam

-- Envia uma imagem. p_base é a origem pública do app (https://...), usada para a capa.
create or replace function api_event_image_add(
  p_secret text, p_event_id uuid, p_kind text, p_mime text, p_data_b64 text, p_base text, p_actor text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e events%rowtype;
  v_data bytea;
  v_id uuid;
  v_url text;
begin
  perform private.assert_secret(p_secret);
  select * into e from events where id = p_event_id;
  if not found then raise exception 'EVENTO_NAO_ENCONTRADO'; end if;
  if p_kind not in ('cover', 'gallery') or p_mime not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'IMAGEM_INVALIDA';
  end if;
  if p_base is null or p_base !~ '^https://[a-z0-9.-]+(:[0-9]+)?$' then raise exception 'IMAGEM_INVALIDA'; end if;
  v_data := decode(p_data_b64, 'base64');
  if length(v_data) < 100 then raise exception 'IMAGEM_INVALIDA'; end if;
  if length(v_data) > 3 * 1024 * 1024 then raise exception 'IMAGEM_GRANDE'; end if;
  if p_kind = 'gallery' and (select count(*) from event_images where event_id = e.id and kind = 'gallery' and not removed) >= 12 then
    raise exception 'GALERIA_CHEIA';
  end if;

  if p_kind = 'cover' then
    update event_images set removed = true where event_id = e.id and kind = 'cover' and not removed;
  end if;

  insert into event_images (event_id, kind, position, mime, bytes, data)
  values (e.id, p_kind, coalesce((select max(position) + 1 from event_images where event_id = e.id and kind = p_kind), 0),
          p_mime, length(v_data), v_data)
  returning id into v_id;

  v_url := p_base || '/imagem/' || v_id;
  if p_kind = 'cover' then
    update events set image_url = v_url where id = e.id;
  end if;

  insert into audit_log (org_id, action, entity, entity_id, data)
  values (e.org_id, 'event_image_add', 'event', e.id, jsonb_build_object('by', p_actor, 'kind', p_kind, 'image', v_id, 'bytes', length(v_data)));
  return jsonb_build_object('id', v_id, 'kind', p_kind, 'url', v_url);
end $$;

-- Remove (soft delete). Se for a capa em uso, limpa a capa do evento.
create or replace function api_event_image_remove(p_secret text, p_id uuid, p_actor text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i event_images%rowtype; v_org uuid;
begin
  perform private.assert_secret(p_secret);
  update event_images set removed = true where id = p_id and not removed returning * into i;
  if not found then raise exception 'IMAGEM_NAO_ENCONTRADA'; end if;
  if i.kind = 'cover' then
    update events set image_url = null where id = i.event_id and image_url like '%/imagem/' || i.id::text;
  end if;
  select org_id into v_org from events where id = i.event_id;
  insert into audit_log (org_id, action, entity, entity_id, data)
  values (v_org, 'event_image_remove', 'event', i.event_id, jsonb_build_object('by', p_actor, 'image', i.id));
  return jsonb_build_object('id', i.id, 'kind', i.kind);
end $$;

-- Lista as imagens do evento (sem os bytes). Público: a página do evento usa a galeria.
create or replace function api_event_images(p_secret text, p_event_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.assert_secret(p_secret);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'bytes', bytes) order by kind, position, created_at)
      from event_images where event_id = p_event_id and not removed), '[]'::jsonb);
end $$;

-- Bytes de uma imagem (base64) para a rota /imagem/<id>. Rascunho também (link só da equipe).
create or replace function api_event_image_get(p_secret text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i event_images%rowtype;
begin
  perform private.assert_secret(p_secret);
  select * into i from event_images where id = p_id and not removed;
  if not found then return null; end if;
  return jsonb_build_object('mime', i.mime, 'data', encode(i.data, 'base64'));
end $$;

revoke all on function api_event_image_add(text, uuid, text, text, text, text, text) from public;
revoke all on function api_event_image_remove(text, uuid, text) from public;
revoke all on function api_event_images(text, uuid) from public;
revoke all on function api_event_image_get(text, uuid) from public;
grant execute on function api_event_image_add(text, uuid, text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function api_event_image_remove(text, uuid, text) to anon, authenticated, service_role;
grant execute on function api_event_images(text, uuid) to anon, authenticated, service_role;
grant execute on function api_event_image_get(text, uuid) to anon, authenticated, service_role;
