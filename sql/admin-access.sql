-- Execute no SQL Editor do Supabase. Esta alteração adiciona campos e políticas;
-- não apaga reservas nem modifica os dados existentes.
-- As políticas antigas das tabelas abaixo serão substituídas pelas regras deste arquivo.
-- Qualquer conta autenticada pode administrar; não é necessário cadastrar o usuário em admin_users.

do $$
declare
  v_policy record;
begin
  for v_policy in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'admin_users', 'reservations', 'spaces', 'toys', 'clients', 'reservation_toys'
      )
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      v_policy.policyname,
      v_policy.tablename
    );
  end loop;
end;
$$;

alter table public.reservations
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists notes text;

alter table public.reservations enable row level security;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.clients enable row level security;
alter table public.reservation_toys enable row level security;

drop policy if exists "admin_users_read_self" on public.admin_users;
create policy "admin_users_read_self"
  on public.admin_users
  for select
  to authenticated
  using (user_id = auth.uid());

grant select on public.admin_users to authenticated;

alter table public.spaces enable row level security;
alter table public.toys enable row level security;

drop policy if exists "public_read_active_spaces" on public.spaces;
create policy "public_read_active_spaces"
  on public.spaces
  for select
  to anon, authenticated
  using (status = 'ativo');

drop policy if exists "public_read_available_toys" on public.toys;
create policy "public_read_available_toys"
  on public.toys
  for select
  to anon, authenticated
  using (status = 'disponivel');

drop policy if exists "admin_manage_spaces" on public.spaces;
create policy "admin_manage_spaces"
  on public.spaces
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "admin_manage_toys" on public.toys;
create policy "admin_manage_toys"
  on public.toys
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

grant select on public.spaces, public.toys to anon, authenticated;
grant insert, update, delete on public.spaces, public.toys to authenticated;

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

drop policy if exists "reservation_admin_select" on public.reservations;
create policy "reservation_admin_select"
  on public.reservations
  for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists "reservation_admin_update" on public.reservations;
create policy "reservation_admin_update"
  on public.reservations
  for update
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

grant select, update on public.reservations to authenticated;
revoke all on public.admin_users, public.reservations, public.clients, public.reservation_toys from anon;
revoke insert, update, delete on public.spaces, public.toys from anon;

drop policy if exists "admin_manage_vivence_media" on storage.objects;
create policy "admin_manage_vivence_media"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'vivence-media'
    and auth.uid() is not null
  )
  with check (
    bucket_id = 'vivence-media'
    and auth.uid() is not null
  );

