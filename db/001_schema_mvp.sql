-- =============================================================================
-- App de ingressos: schema do MVP (Postgres 15+ / Supabase)
-- -----------------------------------------------------------------------------
-- Regra de ouro: TUDO que mexe em contador de vagas trava primeiro a linha do
-- evento (SELECT ... FOR UPDATE). Isso serializa as compras do mesmo evento e
-- impede que duas pessoas peguem a mesma última vaga. As constraints CHECK nos
-- contadores são a segunda rede de proteção: se algum código errar a conta, o
-- banco recusa a gravação em vez de vender acima da capacidade.
--
-- Mutação só pelo servidor (service_role). O navegador apenas lê, via RLS.
-- Valores em centavos (int). Datas em timestamptz.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type member_role      as enum ('owner', 'finance', 'gate');
create type event_status     as enum ('draft', 'on_sale', 'paused', 'closed');
create type batch_status     as enum ('scheduled', 'active', 'sold_out', 'closed');
create type batch_visibility as enum ('public', 'link');
create type offer_variant    as enum ('inteira', 'meia', 'casadinha');
create type order_status     as enum ('pending', 'paid', 'expired', 'canceled', 'refunded', 'needs_refund');
create type payment_method   as enum ('pix', 'card', 'courtesy');
create type ticket_status    as enum ('valid', 'used', 'canceled');
create type coupon_kind      as enum ('percent', 'fixed', 'courtesy');
create type coupon_owner     as enum ('influencer', 'sponsor', 'promoter', 'other');
create type checkin_result   as enum ('accepted', 'duplicate', 'invalid');

-- -----------------------------------------------------------------------------
-- Produtor (multi-produtor desde o início, mesmo que hoje seja um só)
-- -----------------------------------------------------------------------------
create table organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

create table org_members (
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null,                       -- auth.users.id no Supabase
  role       member_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- -----------------------------------------------------------------------------
-- Evento: a capacidade total manda em tudo
-- -----------------------------------------------------------------------------
create table events (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id),
  name                 text not null,
  slug                 text not null,
  venue_name           text,
  starts_at            timestamptz not null,
  timezone             text not null default 'America/Sao_Paulo',
  status               event_status not null default 'draft',

  capacity             int not null check (capacity > 0),          -- [CAPACIDADE DO LOCAL]
  max_seats_per_order  int not null default 8 check (max_seats_per_order > 0),
  reservation_minutes  int not null default 17,                    -- Pix 15 min + 2 de margem
  service_fee_bps      int not null default 0 check (service_fee_bps >= 0), -- [TAXA DE SERVIÇO], 1000 = 10%
  carry_over_leftover  boolean not null default true,              -- sobra de lote migra para o próximo

  -- Meia-entrada (Lei 12.933/2013): cota em vagas. Validar regra com advogado.
  half_quota           int not null default 0 check (half_quota >= 0),
  reserve_half_quota   boolean not null default false,             -- true = segura a cota só para meia

  -- Contadores (só mudam dentro das funções abaixo)
  seats_sold           int not null default 0 check (seats_sold >= 0),
  seats_reserved       int not null default 0 check (seats_reserved >= 0),
  half_sold            int not null default 0 check (half_sold >= 0),
  half_reserved        int not null default 0 check (half_reserved >= 0),

  created_at           timestamptz not null default now(),
  unique (org_id, slug),
  constraint event_within_capacity check (seats_sold + seats_reserved <= capacity),
  constraint half_within_quota     check (half_sold + half_reserved <= half_quota)
);

-- -----------------------------------------------------------------------------
-- Lotes. "track" separa trilhas que correm em paralelo:
--   'principal' (1º ao 4º lote), 'promocional', e 'casadinha' se ela tiver lotes próprios.
-- Só um lote ativo por trilha (índice único parcial).
-- -----------------------------------------------------------------------------
create table batches (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  track       text not null default 'principal',
  position    int  not null,                     -- 1º, 2º, 3º, 4º...
  name        text not null,                     -- "1º lote", "Promo relâmpago"
  quantity    int  not null check (quantity >= 0),  -- em vagas (pessoas)
  sold        int  not null default 0 check (sold >= 0),
  reserved    int  not null default 0 check (reserved >= 0),
  starts_at   timestamptz,                       -- abertura agendada (opcional)
  ends_at     timestamptz,                       -- virada por data (opcional)
  status      batch_status not null default 'scheduled',
  visibility  batch_visibility not null default 'public',
  access_code text,                              -- para lote liberado só por link
  opened_at   timestamptz,
  closed_at   timestamptz,
  unique (event_id, track, position),
  constraint batch_within_quantity check (sold + reserved <= quantity),
  constraint link_needs_code check (visibility = 'public' or access_code is not null)
);
create unique index one_active_batch_per_track on batches (event_id, track) where status = 'active';

-- Preços dentro do lote: inteira, meia, casadinha
create table offers (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references batches(id) on delete cascade,
  variant        offer_variant not null,
  price_cents    int not null check (price_cents >= 0),
  seats_per_unit int not null,
  unique (batch_id, variant),
  constraint seats_match_variant check (
    (variant = 'casadinha' and seats_per_unit = 2) or (variant <> 'casadinha' and seats_per_unit = 1)
  )
);

-- -----------------------------------------------------------------------------
-- Cupons de influenciador / patrocinador (tabela pronta; telas na Fase 2)
-- -----------------------------------------------------------------------------
create table coupons (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  code        text not null,
  owner_name  text not null,
  owner_kind  coupon_owner not null default 'influencer',
  kind        coupon_kind not null,
  value       int not null default 0 check (value >= 0),   -- % (0-100) ou centavos
  max_uses    int check (max_uses > 0),                    -- null = ilimitado
  used        int not null default 0 check (used >= 0),
  reserved    int not null default 0 check (reserved >= 0),
  valid_until timestamptz,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint percent_range check (kind <> 'percent' or value between 1 and 100)
);
create unique index coupons_event_code on coupons (event_id, upper(code));

-- -----------------------------------------------------------------------------
-- Pedidos
-- -----------------------------------------------------------------------------
create table orders (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id),
  event_id           uuid not null references events(id),
  buyer_user_id      uuid,                      -- null = compra sem login
  buyer_name         text not null,
  buyer_email        text not null,
  status             order_status not null default 'pending',
  seats              int not null check (seats > 0),
  half_seats         int not null default 0 check (half_seats >= 0),
  subtotal_cents     int not null check (subtotal_cents >= 0),
  discount_cents     int not null default 0 check (discount_cents >= 0),
  fee_cents          int not null default 0 check (fee_cents >= 0),
  total_cents        int not null check (total_cents >= 0),
  coupon_id          uuid references coupons(id),
  payment_method     payment_method not null,
  gateway            text,                      -- 'mercadopago' | 'asaas'
  gateway_payment_id text,
  idempotency_key    text unique,
  expires_at         timestamptz not null,
  paid_at            timestamptz,
  created_at         timestamptz not null default now(),
  unique (gateway, gateway_payment_id)
);
create index orders_pending_expiry on orders (expires_at) where status = 'pending';
create index orders_event on orders (event_id, status);

create table order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders(id) on delete cascade,
  batch_id         uuid not null references batches(id),
  offer_id         uuid not null references offers(id),
  variant          offer_variant not null,
  quantity         int not null check (quantity > 0),
  seats            int not null check (seats > 0),
  unit_price_cents int not null check (unit_price_cents >= 0)
);
create index order_items_order on order_items (order_id);

-- -----------------------------------------------------------------------------
-- Ingressos (1 por pessoa; casadinha gera 2)
-- -----------------------------------------------------------------------------
create table tickets (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id),
  order_item_id uuid not null references order_items(id),
  event_id      uuid not null references events(id),
  variant       offer_variant not null,
  holder_name   text,                 -- null = comprador ainda vai nomear/enviar
  holder_email  text,
  code          text not null unique, -- vai assinado dentro do QR
  status        ticket_status not null default 'valid',
  issued_at     timestamptz not null default now(),
  used_at       timestamptz
);
create index tickets_event on tickets (event_id, status);

-- -----------------------------------------------------------------------------
-- Portaria
-- -----------------------------------------------------------------------------
create table checkins (
  id             uuid primary key default gen_random_uuid(),
  client_scan_id uuid not null unique,   -- gerado no aparelho: reenvio não duplica
  event_id       uuid references events(id),
  ticket_id      uuid references tickets(id),
  code           text not null,
  device_id      text not null,
  scanned_at     timestamptz not null,   -- hora no aparelho
  received_at    timestamptz not null default now(),
  result         checkin_result not null
);
create unique index one_accepted_checkin_per_ticket on checkins (ticket_id) where result = 'accepted';

-- -----------------------------------------------------------------------------
-- Webhooks (idempotência) e auditoria
-- -----------------------------------------------------------------------------
create table payment_events (
  id                uuid primary key default gen_random_uuid(),
  gateway           text not null,
  external_event_id text not null,
  payload           jsonb not null,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  unique (gateway, external_event_id)
);

create table audit_log (
  id        bigint generated always as identity primary key,
  org_id    uuid,
  actor     uuid,
  action    text not null,
  entity    text not null,
  entity_id uuid,
  data      jsonb,
  at        timestamptz not null default now()
);

-- =============================================================================
-- Funções
-- =============================================================================

-- Código aleatório de 128 bits em base64url (vai dentro do QR, assinado pelo servidor)
create or replace function new_ticket_code() returns text
language sql volatile set search_path = public, extensions as $$
  select translate(rtrim(encode(gen_random_bytes(16), 'base64'), '='), '+/', '-_');
$$;

-- -----------------------------------------------------------------------------
-- Virada de lote (por esgotamento, data ou manual).
-- Fecha o ativo da trilha e abre o próximo agendado. Sobra migra se configurado.
-- -----------------------------------------------------------------------------
create or replace function advance_batch(p_event_id uuid, p_track text, p_reason text, p_actor uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_event    events%rowtype;
  v_cur      batches%rowtype;
  v_next     batches%rowtype;
  v_leftover int := 0;
begin
  select * into v_event from events where id = p_event_id for update;   -- trava do evento
  if not found then raise exception 'EVENTO_NAO_ENCONTRADO'; end if;

  select * into v_cur from batches
   where event_id = p_event_id and track = p_track and status = 'active' for update;

  if found then
    v_leftover := v_cur.quantity - v_cur.sold - v_cur.reserved;
    update batches
       set status = case when v_leftover = 0 then 'sold_out'::batch_status else 'closed'::batch_status end,
           closed_at = now()
     where id = v_cur.id;
  end if;

  select * into v_next from batches
   where event_id = p_event_id and track = p_track and status = 'scheduled'
   order by position limit 1 for update;

  if found then
    if v_cur.id is not null and v_event.carry_over_leftover and v_leftover > 0 then
      update batches set quantity = quantity - v_leftover where id = v_cur.id;
      update batches set quantity = quantity + v_leftover where id = v_next.id;
    end if;
    update batches set status = 'active', opened_at = now() where id = v_next.id;
  end if;

  insert into audit_log (org_id, actor, action, entity, entity_id, data)
  values (v_event.org_id, p_actor, 'batch_advanced', 'batch', coalesce(v_next.id, v_cur.id),
          jsonb_build_object('reason', p_reason, 'track', p_track,
                             'closed', v_cur.id, 'opened', v_next.id, 'leftover', v_leftover));
  return v_next.id;
end $$;

-- -----------------------------------------------------------------------------
-- Libera as vagas de um pedido pendente (expirou, falhou ou foi cancelado).
-- Quem chama já travou o evento.
-- -----------------------------------------------------------------------------
create or replace function _release_order(p_order_id uuid, p_new_status order_status)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order  orders%rowtype;
  v_carry  boolean;
  r        record;
  v_active uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order.status <> 'pending' then return; end if;

  select carry_over_leftover into v_carry from events where id = v_order.event_id;

  update events
     set seats_reserved = seats_reserved - v_order.seats,
         half_reserved  = half_reserved  - v_order.half_seats
   where id = v_order.event_id;

  for r in
    select b.id, b.track, b.status, b.ends_at, sum(oi.seats)::int as seats
      from order_items oi join batches b on b.id = oi.batch_id
     where oi.order_id = p_order_id
     group by b.id, b.track, b.status, b.ends_at
     order by b.id
  loop
    update batches set reserved = reserved - r.seats where id = r.id;

    -- Vagas devolvidas a um lote que já virou: vão para o lote ativo da trilha
    if r.status <> 'active' and v_carry then
      select id into v_active from batches
       where event_id = v_order.event_id and track = r.track and status = 'active';
      if v_active is not null then
        update batches set quantity = quantity - r.seats where id = r.id;
        update batches set quantity = quantity + r.seats where id = v_active;
      elsif r.status = 'sold_out' and (r.ends_at is null or r.ends_at > now()) then
        update batches set status = 'active', closed_at = null where id = r.id;  -- último lote reabre
      end if;
    end if;
  end loop;

  if v_order.coupon_id is not null then
    update coupons set reserved = reserved - 1 where id = v_order.coupon_id;
  end if;

  update orders set status = p_new_status where id = p_order_id;
end $$;

-- -----------------------------------------------------------------------------
-- Confirma o pagamento (chamada pelo webhook, depois de consultar o gateway).
-- Idempotente: chamar duas vezes não emite ingresso em dobro.
-- -----------------------------------------------------------------------------
create or replace function confirm_order(p_order_id uuid, p_gateway text default null, p_gateway_payment_id text default null)
returns order_status
language plpgsql security definer set search_path = public as $$
declare
  v_event_id uuid;
  v_event    events%rowtype;
  v_order    orders%rowtype;
  r          record;
begin
  select event_id into v_event_id from orders where id = p_order_id;
  if not found then raise exception 'PEDIDO_NAO_ENCONTRADO'; end if;

  select * into v_event from events where id = v_event_id for update;    -- trava do evento
  select * into v_order from orders where id = p_order_id for update;

  if v_order.status in ('paid', 'refunded', 'needs_refund') then
    return v_order.status;                                               -- já tratado
  end if;

  if v_order.status = 'pending' then
    update events
       set seats_reserved = seats_reserved - v_order.seats, seats_sold = seats_sold + v_order.seats,
           half_reserved  = half_reserved  - v_order.half_seats, half_sold = half_sold + v_order.half_seats
     where id = v_event.id;
    for r in select batch_id, sum(seats)::int seats from order_items where order_id = p_order_id group by batch_id order by batch_id loop
      update batches set reserved = reserved - r.seats, sold = sold + r.seats where id = r.batch_id;
    end loop;
    if v_order.coupon_id is not null then
      update coupons set reserved = reserved - 1, used = used + 1 where id = v_order.coupon_id;
    end if;

  else
    -- Pagamento chegou depois que a reserva expirou: só aceita se ainda houver vaga no evento
    if v_event.seats_sold + v_event.seats_reserved + v_order.seats > v_event.capacity
       or v_event.half_sold + v_event.half_reserved + v_order.half_seats > v_event.half_quota then
      update orders set status = 'needs_refund', gateway = coalesce(p_gateway, gateway),
             gateway_payment_id = coalesce(p_gateway_payment_id, gateway_payment_id)
       where id = p_order_id;
      return 'needs_refund';                                             -- app dispara o estorno
    end if;
    update events set seats_sold = seats_sold + v_order.seats, half_sold = half_sold + v_order.half_seats
     where id = v_event.id;
    for r in select batch_id, sum(seats)::int seats from order_items where order_id = p_order_id group by batch_id order by batch_id loop
      update batches set quantity = greatest(quantity, sold + reserved + r.seats), sold = sold + r.seats
       where id = r.batch_id;
    end loop;
    if v_order.coupon_id is not null then
      update coupons set used = used + 1 where id = v_order.coupon_id;
    end if;
  end if;

  update orders
     set status = 'paid', paid_at = now(),
         gateway = coalesce(p_gateway, gateway),
         gateway_payment_id = coalesce(p_gateway_payment_id, gateway_payment_id)
   where id = p_order_id;

  -- Emite 1 ingresso por vaga. O 1º fica no nome do comprador; os demais ele nomeia/envia.
  insert into tickets (order_id, order_item_id, event_id, variant, holder_name, holder_email, code)
  select v_order.id, oi.id, v_order.event_id, oi.variant,
         case when row_number() over (order by oi.id, s.n) = 1 then v_order.buyer_name end,
         case when row_number() over (order by oi.id, s.n) = 1 then v_order.buyer_email end,
         new_ticket_code()
    from order_items oi cross join generate_series(1, oi.seats) as s(n)
   where oi.order_id = p_order_id;

  return 'paid';
end $$;

-- -----------------------------------------------------------------------------
-- Itens do carrinho (agrupa ofertas repetidas)
-- -----------------------------------------------------------------------------
create or replace function _cart_lines(p_items jsonb)
returns table (offer_id uuid, qty int)
language sql immutable set search_path = public as $$
  select (e->>'offer_id')::uuid, sum((e->>'quantity')::int)::int
    from jsonb_array_elements(p_items) e
   group by 1;
$$;

-- -----------------------------------------------------------------------------
-- RESERVA ATÔMICA. Chamada pelo servidor ao clicar em "Comprar".
-- p_items: [{"offer_id": "...", "quantity": 2}, ...]
-- Retorna jsonb {order_id, status, total_cents, expires_at}.
-- Erros: EVENTO_FORA_DE_VENDA, EVENTO_ESGOTADO, LOTE_ESGOTADO, MEIA_ESGOTADA,
--        LIMITE_POR_COMPRA, OFERTA_INVALIDA, LOTE_INDISPONIVEL, CUPOM_INVALIDO, CUPOM_ESGOTADO
-- -----------------------------------------------------------------------------
create or replace function reserve_order(
  p_event_id        uuid,
  p_items           jsonb,
  p_buyer_name      text,
  p_buyer_email     text,
  p_payment_method  payment_method default 'pix',
  p_coupon_code     text default null,
  p_access_code     text default null,
  p_buyer_user_id   uuid default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_event     events%rowtype;
  v_coupon    coupons%rowtype;
  v_order_id  uuid;
  v_seats     int := 0;
  v_half      int := 0;
  v_subtotal  int := 0;
  v_discount  int := 0;
  v_fee       int := 0;
  v_total     int;
  v_half_hold int;
  v_status    order_status;
  r           record;
begin
  -- Mesmo clique repetido (rede ruim, duplo toque) devolve o mesmo pedido
  if p_idempotency_key is not null then
    select * into r from orders where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('order_id', r.id, 'status', r.status, 'total_cents', r.total_cents, 'expires_at', r.expires_at);
    end if;
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'OFERTA_INVALIDA';
  end if;

  -- 1) Trava o evento: a partir daqui, compras do mesmo evento esperam na fila
  select * into v_event from events where id = p_event_id for update;
  if not found or v_event.status <> 'on_sale' then raise exception 'EVENTO_FORA_DE_VENDA'; end if;

  -- 2) Valida cada linha e soma vagas e valores
  for r in
    select l.qty, o.id as offer_id, o.variant, o.price_cents, o.seats_per_unit,
           b.id as batch_id, b.event_id, b.status, b.starts_at, b.ends_at, b.visibility, b.access_code
      from _cart_lines(p_items) l
      left join offers  o on o.id = l.offer_id
      left join batches b on b.id = o.batch_id
  loop
    if r.offer_id is null or r.qty is null or r.qty <= 0 or r.event_id <> p_event_id then
      raise exception 'OFERTA_INVALIDA';
    end if;
    if r.status <> 'active'
       or (r.starts_at is not null and r.starts_at > now())
       or (r.ends_at   is not null and r.ends_at  <= now())
       or (r.visibility = 'link' and r.access_code is distinct from p_access_code) then
      raise exception 'LOTE_INDISPONIVEL';
    end if;
    v_seats    := v_seats + r.qty * r.seats_per_unit;
    v_subtotal := v_subtotal + r.qty * r.price_cents;
    if r.variant = 'meia' then v_half := v_half + r.qty; end if;
  end loop;

  if v_seats > v_event.max_seats_per_order then raise exception 'LIMITE_POR_COMPRA'; end if;

  -- 3) Capacidade do evento (limite acima de tudo)
  if v_event.seats_sold + v_event.seats_reserved + v_seats > v_event.capacity then
    raise exception 'EVENTO_ESGOTADO';
  end if;

  -- 4) Meia-entrada: cota própria; se "reserve_half_quota", a cota restante fica guardada para meia
  if v_half > 0 and v_event.half_sold + v_event.half_reserved + v_half > v_event.half_quota then
    raise exception 'MEIA_ESGOTADA';
  end if;
  if v_event.reserve_half_quota then
    v_half_hold := greatest(v_event.half_quota - v_event.half_sold - v_event.half_reserved - v_half, 0);
    if v_event.seats_sold + v_event.seats_reserved + v_seats + v_half_hold > v_event.capacity then
      raise exception 'EVENTO_ESGOTADO';
    end if;
  end if;

  -- 5) Quantidade de cada lote
  for r in
    select b.id, b.quantity, b.sold, b.reserved, sum(l.qty * o.seats_per_unit)::int as need
      from _cart_lines(p_items) l
      join offers o  on o.id = l.offer_id
      join batches b on b.id = o.batch_id
     group by b.id, b.quantity, b.sold, b.reserved
     order by b.id
  loop
    if r.sold + r.reserved + r.need > r.quantity then raise exception 'LOTE_ESGOTADO'; end if;
    update batches set reserved = reserved + r.need where id = r.id;
  end loop;

  -- 6) Cupom
  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select * into v_coupon from coupons
     where event_id = p_event_id and upper(code) = upper(trim(p_coupon_code)) for update;
    if not found or not v_coupon.active or (v_coupon.valid_until is not null and v_coupon.valid_until < now()) then
      raise exception 'CUPOM_INVALIDO';
    end if;
    if v_coupon.max_uses is not null and v_coupon.used + v_coupon.reserved >= v_coupon.max_uses then
      raise exception 'CUPOM_ESGOTADO';
    end if;
    v_discount := case v_coupon.kind
                    when 'percent'  then (v_subtotal * v_coupon.value) / 100
                    when 'fixed'    then least(v_coupon.value, v_subtotal)
                    when 'courtesy' then v_subtotal
                  end;
    update coupons set reserved = reserved + 1 where id = v_coupon.id;
  end if;

  v_fee   := ((v_subtotal - v_discount) * v_event.service_fee_bps) / 10000;
  v_total := v_subtotal - v_discount + v_fee;

  -- 7) Cria o pedido e segura as vagas no evento
  insert into orders (org_id, event_id, buyer_user_id, buyer_name, buyer_email, seats, half_seats,
                      subtotal_cents, discount_cents, fee_cents, total_cents, coupon_id,
                      payment_method, idempotency_key, expires_at)
  values (v_event.org_id, p_event_id, p_buyer_user_id, p_buyer_name, lower(p_buyer_email), v_seats, v_half,
          v_subtotal, v_discount, v_fee, v_total, v_coupon.id,
          case when v_total = 0 then 'courtesy'::payment_method else p_payment_method end,
          p_idempotency_key, now() + make_interval(mins => v_event.reservation_minutes))
  returning id into v_order_id;

  insert into order_items (order_id, batch_id, offer_id, variant, quantity, seats, unit_price_cents)
  select v_order_id, o.batch_id, o.id, o.variant, l.qty, l.qty * o.seats_per_unit, o.price_cents
    from _cart_lines(p_items) l join offers o on o.id = l.offer_id;

  update events
     set seats_reserved = seats_reserved + v_seats, half_reserved = half_reserved + v_half
   where id = p_event_id;

  -- 8) Lote encheu? Vira para o próximo da trilha
  for r in
    select distinct b.event_id, b.track from batches b
     where b.id in (select batch_id from order_items where order_id = v_order_id)
       and b.status = 'active' and b.sold + b.reserved >= b.quantity
  loop
    perform advance_batch(r.event_id, r.track, 'esgotado');
  end loop;

  -- 9) Cortesia (total zero) já sai paga
  v_status := 'pending';
  if v_total = 0 then v_status := confirm_order(v_order_id); end if;

  return jsonb_build_object('order_id', v_order_id, 'status', v_status, 'total_cents', v_total,
                            'expires_at', now() + make_interval(mins => v_event.reservation_minutes));
end $$;

-- -----------------------------------------------------------------------------
-- Cancelamento pelo comprador ou pagamento recusado
-- -----------------------------------------------------------------------------
create or replace function cancel_order(p_order_id uuid) returns order_status
language plpgsql security definer set search_path = public as $$
declare v_event_id uuid; v_status order_status;
begin
  select event_id into v_event_id from orders where id = p_order_id;
  if not found then raise exception 'PEDIDO_NAO_ENCONTRADO'; end if;
  perform 1 from events where id = v_event_id for update;
  perform _release_order(p_order_id, 'canceled');
  select status into v_status from orders where id = p_order_id;
  return v_status;
end $$;

-- -----------------------------------------------------------------------------
-- Expira reservas vencidas (pg_cron, a cada minuto)
-- -----------------------------------------------------------------------------
create or replace function expire_orders() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id, event_id from orders where status = 'pending' and expires_at < now() order by event_id, id loop
    perform 1 from events where id = r.event_id for update;
    perform _release_order(r.id, 'expired');
    n := n + 1;
  end loop;
  return n;
end $$;

-- -----------------------------------------------------------------------------
-- Tique do relógio (pg_cron, a cada minuto): expira reservas, vira lotes por data,
-- abre lotes agendados (ex.: promocional com hora marcada)
-- -----------------------------------------------------------------------------
create or replace function cron_tick() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform expire_orders();

  for r in select event_id, track from batches where status = 'active' and ends_at is not null and ends_at <= now() loop
    perform advance_batch(r.event_id, r.track, 'data');
  end loop;

  for r in
    select distinct on (b.event_id, b.track) b.id, b.event_id, b.track, b.starts_at
      from batches b
     where b.status = 'scheduled'
       and not exists (select 1 from batches a where a.event_id = b.event_id and a.track = b.track and a.status = 'active')
     order by b.event_id, b.track, b.position
  loop
    if r.starts_at is not null and r.starts_at <= now() then
      perform 1 from events where id = r.event_id for update;
      update batches set status = 'active', opened_at = now() where id = r.id and status = 'scheduled';
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Transferência (ex.: segundo ingresso da casadinha). Gera código novo:
-- o QR antigo deixa de valer. O servidor confere se quem pede é o dono.
-- -----------------------------------------------------------------------------
create or replace function transfer_ticket(p_ticket_id uuid, p_name text, p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text; v_old tickets%rowtype;
begin
  select * into v_old from tickets where id = p_ticket_id for update;
  if not found or v_old.status <> 'valid' then raise exception 'INGRESSO_INDISPONIVEL'; end if;
  v_code := new_ticket_code();
  update tickets set holder_name = p_name, holder_email = lower(p_email), code = v_code where id = p_ticket_id;
  insert into audit_log (action, entity, entity_id, data)
  values ('ticket_transferred', 'ticket', p_ticket_id,
          jsonb_build_object('from', v_old.holder_email, 'to', lower(p_email)));
  return v_code;
end $$;

-- -----------------------------------------------------------------------------
-- Sincronização da portaria. p_scans: [{"client_scan_id","code","scanned_at"}, ...]
-- Reenvio do mesmo scan devolve o mesmo resultado. Primeira leitura aceita vence.
-- -----------------------------------------------------------------------------
create or replace function register_checkins(p_device_id text, p_scans jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s        record;
  t        tickets%rowtype;
  v_res    checkin_result;
  v_out    jsonb := '[]'::jsonb;
  v_prev   checkin_result;
begin
  for s in select * from jsonb_to_recordset(p_scans) as x(client_scan_id uuid, code text, scanned_at timestamptz) loop
    select result into v_prev from checkins where client_scan_id = s.client_scan_id;
    if found then
      v_out := v_out || jsonb_build_object('client_scan_id', s.client_scan_id, 'result', v_prev);
      continue;
    end if;

    select * into t from tickets where code = s.code for update;
    if not found or t.status = 'canceled' then
      v_res := 'invalid';
    elsif exists (select 1 from checkins where ticket_id = t.id and result = 'accepted') then
      v_res := 'duplicate';
    else
      v_res := 'accepted';
      update tickets set status = 'used', used_at = s.scanned_at where id = t.id;
    end if;

    insert into checkins (client_scan_id, event_id, ticket_id, code, device_id, scanned_at, result)
    values (s.client_scan_id, t.event_id, t.id, s.code, p_device_id, s.scanned_at, v_res);

    v_out := v_out || jsonb_build_object('client_scan_id', s.client_scan_id, 'result', v_res,
                                         'holder_name', t.holder_name, 'variant', t.variant);
  end loop;
  return v_out;
end $$;

-- =============================================================================
-- Painel: resumo por evento (pagos, cortesias, reservas, receita)
-- =============================================================================
create or replace view event_summary with (security_invoker = true) as
select e.id as event_id, e.org_id, e.name, e.capacity,
       e.seats_sold, e.seats_reserved,
       e.capacity - e.seats_sold - e.seats_reserved as seats_available,
       coalesce(sum(o.seats) filter (where o.status = 'paid' and o.payment_method = 'courtesy'), 0) as seats_courtesy,
       coalesce(sum(o.subtotal_cents) filter (where o.status = 'paid'), 0) as gross_cents,
       coalesce(sum(o.discount_cents) filter (where o.status = 'paid'), 0) as discount_cents,
       coalesce(sum(o.fee_cents)      filter (where o.status = 'paid'), 0) as fee_cents,
       coalesce(sum(o.total_cents)    filter (where o.status = 'paid'), 0) as collected_cents
  from events e
  left join orders o on o.event_id = e.id
 group by e.id;

-- =============================================================================
-- Segurança (RLS). O navegador só lê; escrita só pelo servidor (service_role).
-- =============================================================================
create or replace function is_org_member(p_org uuid, p_roles member_role[] default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members m
                  where m.org_id = p_org and m.user_id = auth.uid()
                    and (p_roles is null or m.role = any (p_roles)));
$$;

alter table organizations  enable row level security;
alter table org_members    enable row level security;
alter table events         enable row level security;
alter table batches        enable row level security;
alter table offers         enable row level security;
alter table coupons        enable row level security;
alter table orders         enable row level security;
alter table order_items    enable row level security;
alter table tickets        enable row level security;
alter table checkins       enable row level security;
alter table payment_events enable row level security;   -- sem policy: só service_role
alter table audit_log      enable row level security;

create policy org_read      on organizations for select using (is_org_member(id));
create policy members_read  on org_members   for select using (is_org_member(org_id, array['owner']::member_role[]) or user_id = auth.uid());

create policy events_public on events for select using (status in ('on_sale', 'paused', 'closed') or is_org_member(org_id));

create policy batches_public on batches for select using (
  exists (select 1 from events e where e.id = event_id
           and ((e.status in ('on_sale', 'paused', 'closed') and visibility = 'public') or is_org_member(e.org_id))));

create policy offers_public on offers for select using (
  exists (select 1 from batches b join events e on e.id = b.event_id where b.id = batch_id
           and ((e.status in ('on_sale', 'paused', 'closed') and b.visibility = 'public') or is_org_member(e.org_id))));

create policy coupons_staff on coupons for select using (
  exists (select 1 from events e where e.id = event_id and is_org_member(e.org_id, array['owner', 'finance']::member_role[])));

create policy orders_own_or_staff on orders for select using (
  buyer_user_id = auth.uid() or is_org_member(org_id, array['owner', 'finance']::member_role[]));

create policy items_own_or_staff on order_items for select using (
  exists (select 1 from orders o where o.id = order_id
           and (o.buyer_user_id = auth.uid() or is_org_member(o.org_id, array['owner', 'finance']::member_role[]))));

create policy tickets_own_or_staff on tickets for select using (
  exists (select 1 from orders o where o.id = order_id
           and (o.buyer_user_id = auth.uid() or is_org_member(o.org_id))));

create policy checkins_staff on checkins for select using (
  exists (select 1 from events e where e.id = event_id and is_org_member(e.org_id)));

create policy audit_staff on audit_log for select using (is_org_member(org_id, array['owner']::member_role[]));

-- Funções que mudam estado: só o servidor executa
revoke execute on all functions in schema public from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from anon, authenticated';
    execute 'grant execute on function is_org_member(uuid, member_role[]) to anon, authenticated';
    execute 'grant execute on all functions in schema public to service_role';
  end if;
end $$;

-- =============================================================================
-- Agendamento (Supabase: habilitar a extensão pg_cron no painel antes)
-- select cron.schedule('ingressos-tick', '* * * * *', 'select public.cron_tick()');
-- =============================================================================
