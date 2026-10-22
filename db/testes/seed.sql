insert into organizations (id, name, slug) values ('00000000-0000-0000-0000-000000000001', 'Produtora Teste', 'teste');
insert into events (id, org_id, name, slug, starts_at, status, capacity, half_quota)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000001', 'Festa Teste', 'festa', now() + interval '30 days', 'on_sale', 100, 40);
-- 4 lotes de 30 (soma 120 > capacidade 100: o evento tem que mandar)
insert into batches (event_id, track, position, name, quantity, status)
select '00000000-0000-0000-0000-0000000000e1', 'principal', p, p || 'º lote', 30, case when p = 1 then 'active' else 'scheduled' end::batch_status
from generate_series(1,4) p;
insert into offers (batch_id, variant, price_cents, seats_per_unit)
select b.id, v.variant, v.base + 1000 * b.position, v.seats from batches b
cross join (values ('inteira'::offer_variant, 5000, 1), ('meia', 2500, 1), ('casadinha', 8000, 2)) v(variant, base, seats);
insert into coupons (event_id, code, owner_name, kind, value, max_uses)
values ('00000000-0000-0000-0000-0000000000e1', 'INFLU10', 'Influencer A', 'percent', 10, 5),
       ('00000000-0000-0000-0000-0000000000e1', 'VIP', 'Patrocinador B', 'courtesy', 0, 3);

-- Cliente de teste: pega a oferta do lote ativo e tenta; se o lote virou no meio, tenta de novo
create or replace function test_buy(p_variant offer_variant, p_qty int) returns text language plpgsql as $$
declare v_offer uuid; v jsonb; tries int := 0;
begin
  loop
    tries := tries + 1;
    select o.id into v_offer from offers o join batches b on b.id = o.batch_id
     where b.event_id = '00000000-0000-0000-0000-0000000000e1' and b.track = 'principal' and b.status = 'active' and o.variant = p_variant;
    if v_offer is null then return 'SEM_LOTE_ATIVO'; end if;
    begin
      v := reserve_order('00000000-0000-0000-0000-0000000000e1', jsonb_build_array(jsonb_build_object('offer_id', v_offer, 'quantity', p_qty)), 'Fulano', 'f@x.com');
      return 'OK';
    exception when others then
      if sqlerrm in ('LOTE_INDISPONIVEL', 'LOTE_ESGOTADO') and tries < 5 then continue; end if;
      return sqlerrm;
    end;
  end loop;
end $$;
