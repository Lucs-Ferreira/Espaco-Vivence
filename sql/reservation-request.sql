-- Execute depois de sql/admin-access.sql.
-- Não remove reservas nem clientes existentes.
-- Remove a unicidade do documento; solicitações pendentes só são apagadas após confirmação no portal.

do $$
declare
  v_constraint record;
  v_index record;
begin
  for v_constraint in
    select constraint_row.conname
    from pg_constraint constraint_row
    join pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace table_schema on table_schema.oid = table_row.relnamespace
    where table_schema.nspname = 'public'
      and table_row.relname = 'clients'
      and constraint_row.contype = 'u'
      and cardinality(constraint_row.conkey) = 1
      and exists (
        select 1
        from pg_attribute column_row
        where column_row.attrelid = constraint_row.conrelid
          and column_row.attnum = constraint_row.conkey[1]
          and column_row.attname = 'document'
      )
  loop
    execute format('alter table public.clients drop constraint %I', v_constraint.conname);
  end loop;

  for v_index in
    select index_row.relname
    from pg_index index_data
    join pg_class table_row on table_row.oid = index_data.indrelid
    join pg_namespace table_schema on table_schema.oid = table_row.relnamespace
    join pg_class index_row on index_row.oid = index_data.indexrelid
    join pg_namespace index_schema on index_schema.oid = index_row.relnamespace
    join pg_attribute column_row
      on column_row.attrelid = index_data.indrelid
      and column_row.attnum = index_data.indkey[0]
    where table_schema.nspname = 'public'
      and table_row.relname = 'clients'
      and index_schema.nspname = 'public'
      and index_data.indisunique
      and not index_data.indisprimary
      and index_data.indnkeyatts = 1
      and column_row.attname = 'document'
      and not exists (
        select 1
        from pg_constraint constraint_row
        where constraint_row.conindid = index_data.indexrelid
      )
  loop
    execute format('drop index if exists public.%I', v_index.relname);
  end loop;
end;
$$;

alter table public.reservations
  add column if not exists subtotal numeric(10, 2) not null default 0,
  add column if not exists notes text,
  add column if not exists delivery_address text,
  add column if not exists start_time time,
  add column if not exists monitor_required boolean not null default false,
  add column if not exists monitor_daily_rate numeric(10, 2) not null default 0;

alter table public.reservations
  alter column subtotal set default 0,
  alter column space_id drop not null;

create table if not exists public.rental_settings (
  id smallint primary key check (id = 1),
  monitor_daily_rate numeric(10, 2) not null default 0 check (monitor_daily_rate >= 0),
  updated_at timestamptz not null default now()
);

insert into public.rental_settings (id, monitor_daily_rate)
values (1, 0)
on conflict (id) do nothing;

alter table public.rental_settings enable row level security;

drop policy if exists "public_read_rental_settings" on public.rental_settings;
create policy "public_read_rental_settings"
  on public.rental_settings
  for select
  to anon, authenticated
  using (id = 1);

drop policy if exists "admin_manage_rental_settings" on public.rental_settings;
create policy "admin_manage_rental_settings"
  on public.rental_settings
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

grant select on public.rental_settings to anon, authenticated;
grant insert, update on public.rental_settings to authenticated;

alter table public.clients enable row level security;
alter table public.reservation_toys enable row level security;

drop policy if exists "admin_read_clients" on public.clients;
create policy "admin_read_clients"
  on public.clients
  for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists "admin_read_reservation_toys" on public.reservation_toys;
create policy "admin_read_reservation_toys"
  on public.reservation_toys
  for select
  to authenticated
  using (auth.uid() is not null);

grant select on public.clients, public.reservation_toys to authenticated;
revoke all on public.clients, public.reservations, public.reservation_toys from anon;

create or replace function public.check_reservation_availability(
  p_space_id uuid,
  p_start_date date,
  p_end_date date,
  p_toys jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_toy_id uuid;
  v_requested_quantity integer;
  v_stock integer;
  v_reserved integer;
  v_available_quantity integer;
  v_toy_available boolean;
  v_toys_result jsonb := '[]'::jsonb;
  v_space_available boolean;
  v_all_available boolean := false;
  v_duplicate_toys boolean;
begin
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception using errcode = '22023', message = 'Informe um período de reserva válido.';
  end if;

  if p_start_date < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception using errcode = '22023', message = 'A data inicial não pode estar no passado.';
  end if;

  if jsonb_typeof(coalesce(p_toys, '[]'::jsonb)) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'A lista de brinquedos é inválida.';
  end if;

  if jsonb_array_length(coalesce(p_toys, '[]'::jsonb)) > 20 then
    raise exception using errcode = '22023', message = 'A lista de brinquedos é inválida.';
  end if;

  select count(*) <> count(distinct value ->> 'toy_id')
    into v_duplicate_toys
  from jsonb_array_elements(coalesce(p_toys, '[]'::jsonb)) as item(value);

  if v_duplicate_toys then
    raise exception using errcode = '22023', message = 'Remova brinquedos duplicados da solicitação.';
  end if;

  if p_space_id is null and jsonb_array_length(coalesce(p_toys, '[]'::jsonb)) = 0 then
    raise exception using errcode = '22023', message = 'Selecione um espaço ou pelo menos um brinquedo.';
  end if;

  if p_space_id is not null then
    select exists (
      select 1
      from public.spaces
      where id = p_space_id and status = 'ativo'
    ) and not exists (
      select 1
      from public.reservations r
      where r.space_id = p_space_id
        and r.start_date <= p_end_date
        and coalesce(r.end_date, r.start_date) >= p_start_date
        and lower(coalesce(r.status, '')) not in (
          'cancelada', 'cancelado', 'rejeitada', 'rejeitado'
        )
    )
    into v_space_available;
  end if;

  v_all_available := p_space_id is null or v_space_available;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_toys, '[]'::jsonb)) as item(value)
  loop
    if coalesce(v_item ->> 'toy_id', '') = '' then
      raise exception using errcode = '22023', message = 'Um brinquedo da solicitação está inválido.';
    end if;

    v_toy_id := (v_item ->> 'toy_id')::uuid;
    v_requested_quantity := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_requested_quantity < 1 then
      raise exception using errcode = '22023', message = 'A quantidade de cada brinquedo deve ser maior que zero.';
    end if;

    select t.total_quantity
      into v_stock
    from public.toys t
    where t.id = v_toy_id and t.status = 'disponivel';

    if not found then
      v_available_quantity := 0;
    else
      select coalesce(sum(rt.quantity), 0)::integer
        into v_reserved
      from public.reservation_toys rt
      join public.reservations r on r.id = rt.reservation_id
      where rt.toy_id = v_toy_id
        and r.start_date <= p_end_date
        and coalesce(r.end_date, r.start_date) >= p_start_date
        and lower(coalesce(r.status, '')) not in (
          'cancelada', 'cancelado', 'rejeitada', 'rejeitado'
        );

      v_available_quantity := greatest(coalesce(v_stock, 0) - v_reserved, 0);
    end if;

    v_toy_available := v_available_quantity >= v_requested_quantity;
    v_all_available := v_all_available and v_toy_available;
    v_toys_result := v_toys_result || jsonb_build_array(
      jsonb_build_object(
        'toy_id', v_toy_id,
        'requested_quantity', v_requested_quantity,
        'available_quantity', v_available_quantity,
        'available', v_toy_available
      )
    );
  end loop;

  return jsonb_build_object(
    'available', v_all_available,
    'space_available', v_space_available,
    'toys', v_toys_result
  );
end;
$$;

drop function if exists public.submit_reservation_request(text, text, text, uuid, date, date, jsonb, text);
drop function if exists public.submit_reservation_request(text, text, text, uuid, date, date, jsonb, text, text, boolean);
drop function if exists public.submit_reservation_request(text, text, text, text, uuid, date, date, jsonb, text, text, boolean);
drop function if exists public.submit_reservation_request(text, text, text, text, uuid, date, date, time, jsonb, text, text, boolean);
drop function if exists public.submit_reservation_request(text, text, text, text, uuid, date, date, time, jsonb, text, text, boolean, text);

create or replace function public.submit_reservation_request(
  p_client_name text,
  p_client_email text,
  p_client_phone text,
  p_client_document text,
  p_space_id uuid,
  p_start_date date,
  p_end_date date,
  p_start_time time,
  p_toys jsonb default '[]'::jsonb,
  p_notes text default null,
  p_delivery_address text default null,
  p_monitor_required boolean default false,
  p_existing_action text default 'check'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_toy_id uuid;
  v_quantity integer;
  v_toy_rate numeric;
  v_space_rate numeric;
  v_monitor_daily_rate numeric(10, 2) := 0;
  v_total_amount numeric;
  v_days integer;
  v_client_id uuid;
  v_client_document text;
  v_reservation_id uuid;
  v_availability jsonb;
  v_lock_key integer;
  v_duplicate_toys boolean;
  v_pending_count integer := 0;
  v_approved_count integer := 0;
  v_pending_reservation_ids uuid[] := array[]::uuid[];
  v_deleted_count integer := 0;
  v_existing_action text := coalesce(nullif(btrim(p_existing_action), ''), 'check');
begin
  if length(btrim(coalesce(p_client_name, ''))) < 2
    or length(btrim(p_client_name)) > 120 then
    raise exception using errcode = '22023', message = 'Informe um nome válido.';
  end if;

  if length(btrim(coalesce(p_client_email, ''))) > 254
    or btrim(coalesce(p_client_email, '')) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode = '22023', message = 'Informe um e-mail válido.';
  end if;

  if length(regexp_replace(coalesce(p_client_phone, ''), '[^0-9]', '', 'g')) < 8
    or length(coalesce(p_client_phone, '')) > 30 then
    raise exception using errcode = '22023', message = 'Informe um telefone válido.';
  end if;

  v_client_document := regexp_replace(coalesce(p_client_document, ''), '[^0-9]', '', 'g');
  if length(v_client_document) not in (11, 14) then
    raise exception using errcode = '22023', message = 'Informe um CPF ou CNPJ válido.';
  end if;

  if length(coalesce(p_notes, '')) > 1000 then
    raise exception using errcode = '22023', message = 'As observações devem ter até 1000 caracteres.';
  end if;

  if length(btrim(coalesce(p_delivery_address, ''))) < 10
    or length(p_delivery_address) > 500 then
    raise exception using errcode = '22023', message = 'Informe um endereço válido para o aluguel.';
  end if;

  if p_monitor_required is null then
    raise exception using errcode = '22023', message = 'A opção de monitor é inválida.';
  end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception using errcode = '22023', message = 'Informe um período de reserva válido.';
  end if;

  if p_start_time is null then
    raise exception using errcode = '22023', message = 'Informe o horário do evento.';
  end if;

  if p_start_date < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception using errcode = '22023', message = 'A data inicial não pode estar no passado.';
  end if;

  if jsonb_typeof(coalesce(p_toys, '[]'::jsonb)) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'A lista de brinquedos é inválida.';
  end if;

  if jsonb_array_length(coalesce(p_toys, '[]'::jsonb)) > 20 then
    raise exception using errcode = '22023', message = 'A lista de brinquedos é inválida.';
  end if;

  select count(*) <> count(distinct value ->> 'toy_id')
    into v_duplicate_toys
  from jsonb_array_elements(coalesce(p_toys, '[]'::jsonb)) as item(value);

  if v_duplicate_toys then
    raise exception using errcode = '22023', message = 'Remova brinquedos duplicados da solicitação.';
  end if;

  if p_space_id is null and jsonb_array_length(coalesce(p_toys, '[]'::jsonb)) = 0 then
    raise exception using errcode = '22023', message = 'Selecione um espaço ou pelo menos um brinquedo.';
  end if;

  if v_existing_action not in ('check', 'delete_pending_and_submit', 'allow_new') then
    raise exception using errcode = '22023', message = 'A confirmação de solicitação anterior é inválida.';
  end if;

  perform pg_advisory_xact_lock(hashtext('reservation-document:' || v_client_document)::bigint);

  select
    count(*) filter (where lower(coalesce(r.status, '')) = 'solicitacao_recebida'),
    count(*) filter (
      where lower(coalesce(r.status, '')) not in (
        '', 'solicitacao_recebida', 'cancelada', 'cancelado', 'rejeitada', 'rejeitado'
      )
    )
  into v_pending_count, v_approved_count
  from public.reservations r
  join public.clients c on c.id = r.client_id
  where regexp_replace(coalesce(c.document, ''), '[^0-9]', '', 'g') = v_client_document;

  if v_pending_count > 0 and v_existing_action <> 'delete_pending_and_submit' then
    return jsonb_build_object('status', 'pending_existing');
  end if;

  if v_pending_count = 0
    and v_approved_count > 0
    and v_existing_action = 'check' then
    return jsonb_build_object('status', 'approved_existing');
  end if;

  if v_existing_action = 'delete_pending_and_submit' and v_pending_count > 0 then
    select coalesce(array_agg(pending.id), array[]::uuid[])
      into v_pending_reservation_ids
    from (
      select r.id
      from public.reservations r
      join public.clients c on c.id = r.client_id
      where regexp_replace(coalesce(c.document, ''), '[^0-9]', '', 'g') = v_client_document
        and lower(coalesce(r.status, '')) = 'solicitacao_recebida'
      for update of r
    ) as pending;

    delete from public.reservation_toys
    where reservation_id = any(v_pending_reservation_ids);

    delete from public.reservations
    where id = any(v_pending_reservation_ids)
      and lower(coalesce(status, '')) = 'solicitacao_recebida';
    get diagnostics v_deleted_count = row_count;

    if v_deleted_count = 0 then
      raise exception using errcode = 'P0001', message = 'A solicitação pendente mudou de status. Atualize a página e tente novamente.';
    end if;
  end if;

  v_availability := public.check_reservation_availability(
    p_space_id, p_start_date, p_end_date, coalesce(p_toys, '[]'::jsonb)
  );

  for v_lock_key in
    select lock_keys.lock_key
    from (
      select hashtext('space:' || p_space_id::text) as lock_key
      where p_space_id is not null
      union
      select hashtext('toy:' || (value ->> 'toy_id')) as lock_key
      from jsonb_array_elements(coalesce(p_toys, '[]'::jsonb)) as item(value)
    ) as lock_keys
    order by lock_keys.lock_key
  loop
    perform pg_advisory_xact_lock(v_lock_key::bigint);
  end loop;

  v_availability := public.check_reservation_availability(
    p_space_id, p_start_date, p_end_date, coalesce(p_toys, '[]'::jsonb)
  );

  if not coalesce((v_availability ->> 'available')::boolean, false) then
    raise exception using errcode = 'P0001', message = 'Um espaço ou brinquedo não está mais disponível para esse período.';
  end if;

  v_days := p_end_date - p_start_date + 1;
  v_total_amount := 0;

  if p_space_id is not null then
    select s.daily_rate
      into v_space_rate
    from public.spaces s
    where s.id = p_space_id and s.status = 'ativo';

    if not found or v_space_rate is null or v_space_rate < 0 then
      raise exception using errcode = 'P0001', message = 'O espaço selecionado não está disponível.';
    end if;

    v_total_amount := v_total_amount + (v_space_rate * v_days);
  end if;

  if p_monitor_required then
    select settings.monitor_daily_rate
      into v_monitor_daily_rate
    from public.rental_settings settings
    where settings.id = 1;

    if not found or v_monitor_daily_rate < 0 then
      raise exception using errcode = 'P0001', message = 'O valor do monitor não está configurado.';
    end if;

    v_total_amount := v_total_amount + (v_monitor_daily_rate * v_days);
  end if;

  select c.id
    into v_client_id
  from public.clients c
  where lower(c.email) = lower(btrim(p_client_email))
  order by c.id
  limit 1;

  if v_client_id is null then
    insert into public.clients (name, email, phone, document)
    values (
      btrim(p_client_name),
      lower(btrim(p_client_email)),
      btrim(p_client_phone),
      v_client_document
    )
    returning id into v_client_id;
  end if;

  insert into public.reservations (
    client_id, space_id, start_date, end_date, start_time, status, subtotal, total_amount, notes,
    delivery_address, monitor_required, monitor_daily_rate
  )
  values (
    v_client_id, p_space_id, p_start_date, p_end_date, p_start_time,
    'solicitacao_recebida', v_total_amount, v_total_amount,
    nullif(btrim(coalesce(p_notes, '')), ''),
    btrim(p_delivery_address), p_monitor_required, v_monitor_daily_rate
  )
  returning id into v_reservation_id;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_toys, '[]'::jsonb)) as item(value)
  loop
    v_toy_id := (v_item ->> 'toy_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;

    select t.daily_rate
      into v_toy_rate
    from public.toys t
    where t.id = v_toy_id and t.status = 'disponivel';

    if not found or v_toy_rate is null or v_toy_rate < 0 then
      raise exception using errcode = 'P0001', message = 'Um brinquedo selecionado não está disponível.';
    end if;

    insert into public.reservation_toys (reservation_id, toy_id, quantity, unit_price)
    values (v_reservation_id, v_toy_id, v_quantity, v_toy_rate);

    v_total_amount := v_total_amount + (v_toy_rate * v_quantity * v_days);
  end loop;

  update public.reservations
  set subtotal = v_total_amount,
      total_amount = v_total_amount
  where id = v_reservation_id;

  return jsonb_build_object('status', 'created', 'reservation_id', v_reservation_id);
end;
$$;

revoke all on function public.check_reservation_availability(uuid, date, date, jsonb) from public;
revoke all on function public.submit_reservation_request(text, text, text, text, uuid, date, date, time, jsonb, text, text, boolean, text) from public;
grant execute on function public.check_reservation_availability(uuid, date, date, jsonb) to anon, authenticated;
grant execute on function public.submit_reservation_request(text, text, text, text, uuid, date, date, time, jsonb, text, text, boolean, text) to anon, authenticated;
