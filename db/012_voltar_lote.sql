-- =============================================================================
-- 012: voltar lote (desfaz a última virada da trilha)
-- Para quando o produtor clica em "Virar lote" sem querer. Usa o registro da
-- virada em audit_log (batch_advanced) que abriu o lote que está à venda agora:
--   * o lote à venda volta a "agendado" (as vendas que ele já tiver continuam
--     valendo; quando abrir de novo, segue de onde parou);
--   * o lote anterior volta a "à venda";
--   * se a sobra tinha migrado para o novo lote (carry_over_leftover), ela volta.
-- Recusa se houver alguém pagando no lote atual, se o anterior esgotou ou foi
-- apagado, ou se a data de virada do anterior já passou (o relógio viraria de
-- novo no minuto seguinte).
-- =============================================================================

create or replace function api_batch_revert(p_secret text, p_event_id uuid, p_track text default 'principal',
                                            p_actor text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e      events%rowtype;
  v_cur  batches%rowtype;
  v_prev batches%rowtype;
  v_log  audit_log%rowtype;
  v_back int := 0;
begin
  perform private.assert_secret(p_secret);
  select * into e from events where id = p_event_id for update;            -- trava do evento
  if not found then raise exception 'EVENTO_NAO_ENCONTRADO'; end if;

  select * into v_cur from batches
   where event_id = p_event_id and track = p_track and status = 'active' and not removed for update;
  if not found then raise exception 'SEM_VIRADA_PARA_VOLTAR'; end if;

  -- Última virada que abriu o lote que está à venda agora
  select * into v_log from audit_log
   where action = 'batch_advanced' and data->>'opened' = v_cur.id::text and data->>'closed' is not null
   order by id desc limit 1;
  if not found then raise exception 'SEM_VIRADA_PARA_VOLTAR'; end if;

  select * into v_prev from batches where id = (v_log.data->>'closed')::uuid and event_id = p_event_id for update;
  if not found or v_prev.removed then raise exception 'SEM_VIRADA_PARA_VOLTAR'; end if;
  if v_prev.status <> 'closed' then raise exception 'VOLTA_LOTE_ESGOTADO'; end if;
  if v_cur.reserved > 0 then raise exception 'VOLTA_COM_RESERVA'; end if;
  if v_prev.ends_at is not null and v_prev.ends_at <= now() then raise exception 'VOLTA_DATA_VENCIDA'; end if;

  -- Devolve a sobra que migrou na virada (só o que ainda não foi vendido no lote atual)
  if e.carry_over_leftover then
    v_back := least(coalesce((v_log.data->>'leftover')::int, 0), v_cur.quantity - v_cur.sold - v_cur.reserved);
    v_back := greatest(v_back, 0);
  end if;

  update batches set status = 'scheduled', opened_at = null, quantity = quantity - v_back where id = v_cur.id;
  update batches set status = 'active', closed_at = null, quantity = quantity + v_back where id = v_prev.id;

  -- Anterior sem nada para vender (sobra não voltou): esgota de novo na hora
  if v_prev.quantity + v_back - v_prev.sold - v_prev.reserved <= 0 then
    raise exception 'VOLTA_LOTE_ESGOTADO';
  end if;

  insert into audit_log (org_id, action, entity, entity_id, data)
  values (e.org_id, 'batch_reverted', 'batch', v_prev.id,
          jsonb_build_object('by', p_actor, 'track', p_track, 'reopened', v_prev.id, 'reopened_name', v_prev.name,
                             'back_to_scheduled', v_cur.id, 'leftover_back', v_back, 'advance_log', v_log.id));
  return jsonb_build_object('ok', true, 'reopened', v_prev.id, 'name', v_prev.name, 'from', v_cur.name,
                            'leftover_back', v_back);
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function api_batch_revert(text, uuid, text, text) from public;
    grant execute on function api_batch_revert(text, uuid, text, text) to anon, authenticated, service_role;
  end if;
end $$;
