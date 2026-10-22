-- =============================================================================
-- 005: equipe com acesso por função + resultado da festa (bilheteria + bar)
-- Funções: produtor (tudo), bilheteria (painel de ingressos + portaria),
--          portaria (só leitor), gerente_bar (PDV + estoque + relatórios do bar),
--          caixa_bar (só PDV).
-- Senha guardada com bcrypt (pgcrypto). 5 erros seguidos bloqueiam por 10 minutos.
-- =============================================================================

create table staff_users (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  name             text not null,
  login            text not null,
  pass_hash        text not null,
  role             text not null check (role in ('produtor', 'bilheteria', 'portaria', 'gerente_bar', 'caixa_bar')),
  active           boolean not null default true,
  failed_attempts  int not null default 0,
  locked_until     timestamptz,
  last_login_at    timestamptz,
  created_at       timestamptz not null default now()
);
create unique index staff_users_login_uq on staff_users (lower(login));
alter table staff_users enable row level security;

-- Login. Não lança exceção em senha errada (a contagem de tentativas precisa ser gravada).
create or replace function api_staff_login(p_secret text, p_login text, p_password text, p_app text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u staff_users%rowtype; v_allowed text[];
begin
  perform private.assert_secret(p_secret);
  v_allowed := case p_app
    when 'bilheteria' then array['produtor', 'bilheteria', 'portaria']
    when 'bar' then array['produtor', 'gerente_bar', 'caixa_bar']
    else array[]::text[] end;

  select * into u from staff_users where lower(login) = lower(trim(coalesce(p_login, ''))) for update;
  if not found or not u.active then
    return jsonb_build_object('ok', false, 'error', 'CREDENCIAIS_INVALIDAS');
  end if;
  if u.locked_until is not null and u.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'ACESSO_BLOQUEADO');
  end if;
  if u.pass_hash <> crypt(coalesce(p_password, ''), u.pass_hash) then
    update staff_users
       set failed_attempts = case when u.failed_attempts + 1 >= 5 then 0 else u.failed_attempts + 1 end,
           locked_until = case when u.failed_attempts + 1 >= 5 then now() + interval '10 minutes' else null end
     where id = u.id;
    insert into audit_log (org_id, action, entity, entity_id, data)
    values (u.org_id, 'staff_login_failed', 'staff_user', u.id, jsonb_build_object('app', p_app));
    return jsonb_build_object('ok', false, 'error', 'CREDENCIAIS_INVALIDAS');
  end if;
  if not (u.role = any(v_allowed)) then
    return jsonb_build_object('ok', false, 'error', 'ACESSO_OUTRO_SISTEMA', 'role', u.role);
  end if;
  update staff_users set failed_attempts = 0, locked_until = null, last_login_at = now() where id = u.id;
  insert into audit_log (org_id, action, entity, entity_id, data)
  values (u.org_id, 'staff_login', 'staff_user', u.id, jsonb_build_object('app', p_app));
  return jsonb_build_object('ok', true, 'id', u.id, 'name', u.name, 'role', u.role);
end $$;

create or replace function api_staff_list(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.assert_secret(p_secret);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'login', login, 'role', role, 'active', active,
      'locked', locked_until is not null and locked_until > now(), 'last_login_at', last_login_at)
      order by active desc, array_position(array['produtor', 'bilheteria', 'portaria', 'gerente_bar', 'caixa_bar'], role), name)
    from staff_users), '[]'::jsonb);
end $$;

-- Cria ou edita um acesso. Senha obrigatória ao criar; ao editar, só se for redefinir.
create or replace function api_staff_upsert(
  p_secret text, p_slug text, p_id uuid, p_name text, p_login text, p_role text, p_password text, p_active boolean, p_actor text default null
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare e events%rowtype; v_id uuid; v_before staff_users%rowtype; v_login text;
begin
  perform private.assert_secret(p_secret);
  select * into e from events where slug = p_slug;
  if not found then raise exception 'EVENTO_NAO_ENCONTRADO'; end if;
  v_login := lower(trim(coalesce(p_login, '')));
  if length(trim(coalesce(p_name, ''))) = 0 or v_login !~ '^[a-z0-9._-]{3,30}$'
     or p_role not in ('produtor', 'bilheteria', 'portaria', 'gerente_bar', 'caixa_bar') then
    raise exception 'DADOS_INVALIDOS';
  end if;
  if p_password is not null and length(p_password) > 0 and length(p_password) < 6 then raise exception 'SENHA_CURTA'; end if;

  if p_id is not null then
    select * into v_before from staff_users where id = p_id for update;
    if not found then raise exception 'ACESSO_NAO_ENCONTRADO'; end if;
    -- Nunca deixar o sistema sem produtor ativo
    if v_before.role = 'produtor' and v_before.active and (p_role <> 'produtor' or not coalesce(p_active, true))
       and (select count(*) from staff_users where role = 'produtor' and active and id <> p_id) = 0 then
      raise exception 'ULTIMO_PRODUTOR';
    end if;
  elsif p_password is null or length(p_password) = 0 then
    raise exception 'SENHA_CURTA';
  end if;

  begin
    if p_id is null then
      insert into staff_users (org_id, name, login, pass_hash, role, active)
      values (e.org_id, trim(p_name), v_login, crypt(p_password, gen_salt('bf', 10)), p_role, coalesce(p_active, true))
      returning id into v_id;
    else
      update staff_users set name = trim(p_name), login = v_login, role = p_role, active = coalesce(p_active, true),
             pass_hash = case when p_password is not null and length(p_password) > 0 then crypt(p_password, gen_salt('bf', 10)) else pass_hash end,
             failed_attempts = case when p_password is not null and length(p_password) > 0 then 0 else failed_attempts end,
             locked_until = case when p_password is not null and length(p_password) > 0 then null else locked_until end
       where id = p_id
      returning id into v_id;
    end if;
  exception when unique_violation then
    raise exception 'LOGIN_DUPLICADO';
  end;

  insert into audit_log (org_id, action, entity, entity_id, data)
  values (e.org_id, case when p_id is null then 'staff_created' else 'staff_updated' end, 'staff_user', v_id,
          jsonb_build_object('by', p_actor, 'login', v_login, 'role', p_role, 'active', coalesce(p_active, true),
                             'password_changed', p_password is not null and length(p_password) > 0,
                             'before', case when p_id is null then null else jsonb_build_object('role', v_before.role, 'active', v_before.active) end));
  return v_id;
end $$;

-- Resultado da festa: ingressos + bar do mesmo evento
create or replace function api_festa_result(p_secret text, p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events%rowtype;
begin
  perform private.assert_secret(p_secret);
  select * into e from events where slug = p_slug;
  if not found then return null; end if;
  return jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'starts_at', e.starts_at,
                                'venue_name', e.venue_name, 'capacity', e.capacity, 'timezone', e.timezone),
    'tickets', (select jsonb_build_object(
        'collected_cents', coalesce(sum(o.total_cents), 0),
        'orders', count(*),
        'seats', coalesce(sum(o.seats), 0),
        'courtesy_seats', coalesce(sum(o.seats) filter (where o.payment_method = 'courtesy'), 0))
      from orders o where o.event_id = e.id and o.status = 'paid'),
    'checkins', (select count(*) from checkins c where c.event_id = e.id and c.result = 'accepted'),
    'bar', (select jsonb_build_object(
        'revenue_cents', coalesce(sum(i.qty * i.unit_price_cents), 0),
        'cost_cents', coalesce(sum(i.qty * i.unit_cost_cents), 0),
        'units', coalesce(sum(i.qty), 0),
        'sales', count(distinct s.id))
      from bar_sales s join bar_sale_items i on i.sale_id = s.id
      where s.event_id = e.id and not s.canceled)
  );
end $$;
