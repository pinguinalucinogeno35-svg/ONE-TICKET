-- =============================================================================
-- 010: tirar uma modalidade do lote (ex.: lote "sem meia-entrada")
-- Remove a oferta de meia ou casadinha de um lote. A inteira é obrigatória.
-- Se alguém já comprou (ou está com reserva) naquela modalidade do lote, recusa:
-- a oferta é referenciada pelo pedido e o preço vendido não pode sumir.
-- Lei 12.933/2013: a cota de meia (40%) vale para o evento todo; lote sem meia
-- só é seguro se o evento ainda oferece meia suficiente em outros lotes.
-- =============================================================================

create or replace function api_offer_remove(p_secret text, p_batch_id uuid, p_variant offer_variant, p_actor text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b batches%rowtype; e events%rowtype; o offers%rowtype;
begin
  perform private.assert_secret(p_secret);
  if p_variant = 'inteira' then raise exception 'DADOS_INVALIDOS'; end if;
  select * into b from batches where id = p_batch_id and not removed;
  if not found then raise exception 'LOTE_NAO_ENCONTRADO'; end if;
  select * into e from events where id = b.event_id for update;           -- trava do evento
  select * into o from offers where batch_id = p_batch_id and variant = p_variant;
  if not found then return jsonb_build_object('ok', true, 'removed', false); end if;
  if exists (select 1 from order_items where offer_id = o.id) then raise exception 'MODALIDADE_COM_VENDAS'; end if;
  delete from offers where id = o.id;
  insert into audit_log (org_id, action, entity, entity_id, data)
  values (e.org_id, 'offer_removed', 'batch', p_batch_id,
          jsonb_build_object('by', p_actor, 'variant', p_variant, 'price_cents', o.price_cents));
  return jsonb_build_object('ok', true, 'removed', true);
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
