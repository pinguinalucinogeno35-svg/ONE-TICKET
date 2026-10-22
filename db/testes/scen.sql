\pset footer off
\set e '''00000000-0000-0000-0000-0000000000e1'''
create temp table r(t text, v text);
create or replace function pg_temp.try(sql text) returns text language plpgsql as $$
declare v jsonb; begin execute sql into v; return v::text; exception when others then return 'ERRO: ' || sqlerrm; end $$;
create or replace function pg_temp.offer(v offer_variant) returns uuid language sql as $$
 select o.id from offers o join batches b on b.id=o.batch_id where b.status='active' and b.track='principal' and o.variant=v $$;

-- 1) Pagamento atrasado de pedido expirado, com vaga no evento -> pago
insert into r select '1 pagamento atrasado', confirm_order((select id from orders where status='expired' limit 1))::text;
-- 2) Limite por compra (9 vagas)
insert into r select '2 limite 9 vagas', pg_temp.try(format($q$select reserve_order(%L, '[{"offer_id":"%s","quantity":9}]', 'A','a@x.com')$q$, :e, pg_temp.offer('inteira')));
-- 3) Cupom 10%
insert into r select '3 cupom 10%', pg_temp.try(format($q$select reserve_order(%L, '[{"offer_id":"%s","quantity":2}]', 'A','a@x.com', 'pix', 'influ10')$q$, :e, pg_temp.offer('inteira')));
insert into r select '3b desconto gravado', (select subtotal_cents||' - '||discount_cents||' = '||total_cents from orders where coupon_id is not null order by created_at desc limit 1);
-- 4) Cortesia sai paga na hora com QR
insert into r select '4 cortesia', pg_temp.try(format($q$select reserve_order(%L, '[{"offer_id":"%s","quantity":1}]', 'Convidado','c@x.com', 'pix', 'VIP')$q$, :e, pg_temp.offer('inteira')));
-- 5) Cupom esgotado (max 3 usos)
select pg_temp.try(format($q$select reserve_order(%L, '[{"offer_id":"%s","quantity":1}]', 'C','c@x.com', 'pix', 'VIP')$q$, :e, pg_temp.offer('inteira'))) from generate_series(1,2);
insert into r select '5 cupom esgotado', pg_temp.try(format($q$select reserve_order(%L, '[{"offer_id":"%s","quantity":1}]', 'C','c@x.com', 'pix', 'VIP')$q$, :e, pg_temp.offer('inteira')));
-- 6) Idempotência: mesmo clique 2x = mesmo pedido
insert into r select '6 idempotencia', (select count(distinct x) from (select pg_temp.try(format($q$select reserve_order(%L, '[{"offer_id":"%s","quantity":1}]', 'D','d@x.com', 'pix', null, null, null, 'clique-123')$q$, :e, pg_temp.offer('inteira'))) x from generate_series(1,2)) y)::text || ' pedido distinto';
-- 7) Cota de meia: 40 - vendidas
update events set half_quota = half_sold + half_reserved + 1;
insert into r select '7 meia acima da cota', pg_temp.try(format($q$select reserve_order(%L, '[{"offer_id":"%s","quantity":2}]', 'E','e@x.com')$q$, :e, pg_temp.offer('meia')));
-- 8) Lote por link sem codigo / com codigo
insert into batches (event_id, track, position, name, quantity, status, visibility, access_code) values (:e, 'promocional', 1, 'Promo', 5, 'active', 'link', 'segredo');
insert into offers (batch_id, variant, price_cents, seats_per_unit) select id, 'inteira', 3000, 1 from batches where track='promocional';
insert into r select '8a promo sem codigo', pg_temp.try(format($q$select reserve_order(%L, '[{"offer_id":"%s","quantity":1}]', 'F','f@x.com')$q$, :e, (select o.id from offers o join batches b on b.id=o.batch_id where b.track='promocional')));
insert into r select '8b promo com codigo', left(pg_temp.try(format($q$select reserve_order(%L, '[{"offer_id":"%s","quantity":1}]', 'F','f@x.com','pix',null,'segredo')$q$, :e, (select o.id from offers o join batches b on b.id=o.batch_id where b.track='promocional'))), 40);
-- 9) Virada por data
update batches set ends_at = now() - interval '1 second' where track='promocional';
select cron_tick();
insert into r select '9 promo apos data', status::text from batches where track='promocional';
-- 10) Portaria: aceita, duplicado, reenvio idempotente, invalido
with t as (select code from tickets where status='valid' limit 1)
insert into r select '10a 1a leitura', register_checkins('porta-1', jsonb_build_array(jsonb_build_object('client_scan_id','11111111-1111-1111-1111-111111111111','code',(select code from t),'scanned_at',now())))::text;
insert into r select '10b mesma leitura reenviada', register_checkins('porta-1', jsonb_build_array(jsonb_build_object('client_scan_id','11111111-1111-1111-1111-111111111111','code',(select code from checkins limit 1),'scanned_at',now())))::text;
insert into r select '10c outra porta mesmo QR', register_checkins('porta-2', jsonb_build_array(jsonb_build_object('client_scan_id','22222222-2222-2222-2222-222222222222','code',(select code from checkins limit 1),'scanned_at',now())))::text;
insert into r select '10d QR falso', register_checkins('porta-2', jsonb_build_array(jsonb_build_object('client_scan_id','33333333-3333-3333-3333-333333333333','code','nao-existe','scanned_at',now())))::text;
-- 11) Transferencia: codigo antigo deixa de valer
create temp table tt as select id, code from tickets where status='valid' and holder_name is null limit 1;
select transfer_ticket((select id from tt), 'Amiga', 'amiga@x.com');
insert into r select '11 QR antigo apos transferencia', register_checkins('porta-1', jsonb_build_array(jsonb_build_object('client_scan_id','44444444-4444-4444-4444-444444444444','code',(select code from tt),'scanned_at',now())))::text;
-- 12) Constraint: forçar venda acima da capacidade direto no banco
insert into r select '12 burlar capacidade', pg_temp.try($q$update events set seats_sold = capacity + 1 returning 1::text::jsonb$q$);
select * from r;
\i ./check.sql
