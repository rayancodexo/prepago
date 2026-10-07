create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  filiere text check (filiere in ('MP','PSI','ECS','EST')),
  role text not null default 'student' check (role in ('student','admin')),
  xp integer not null default 0 check (xp >= 0),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

grant select, update on public.profiles to authenticated;
