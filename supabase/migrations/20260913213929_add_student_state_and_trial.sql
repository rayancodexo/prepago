alter table public.profiles
  add column if not exists trial_started_at timestamptz not null default now(),
  add column if not exists trial_ends_at timestamptz not null default (now() + interval '30 days'),
  add column if not exists subscription_status text not null default 'trial',
  add column if not exists subscription_ends_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_subscription_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_subscription_status_check
      check (subscription_status in ('trial','active','expired','cancelled'));
  end if;
end $$;

create table if not exists public.student_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.student_app_state enable row level security;

drop policy if exists "Users can view own app state" on public.student_app_state;
create policy "Users can view own app state"
on public.student_app_state
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (
        (p.subscription_status = 'trial' and p.trial_ends_at > now())
        or
        (p.subscription_status = 'active' and (p.subscription_ends_at is null or p.subscription_ends_at > now()))
      )
  )
);

drop policy if exists "Users can insert own app state" on public.student_app_state;
create policy "Users can insert own app state"
on public.student_app_state
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (
        (p.subscription_status = 'trial' and p.trial_ends_at > now())
        or
        (p.subscription_status = 'active' and (p.subscription_ends_at is null or p.subscription_ends_at > now()))
      )
  )
);

drop policy if exists "Users can update own app state" on public.student_app_state;
create policy "Users can update own app state"
on public.student_app_state
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (
        (p.subscription_status = 'trial' and p.trial_ends_at > now())
        or
        (p.subscription_status = 'active' and (p.subscription_ends_at is null or p.subscription_ends_at > now()))
      )
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (
        (p.subscription_status = 'trial' and p.trial_ends_at > now())
        or
        (p.subscription_status = 'active' and (p.subscription_ends_at is null or p.subscription_ends_at > now()))
      )
  )
);

drop policy if exists "Users can delete own app state" on public.student_app_state;
create policy "Users can delete own app state"
on public.student_app_state
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.student_app_state from anon;
grant select, insert, update, delete on public.student_app_state to authenticated;

revoke update on public.profiles from authenticated;
grant update (full_name, filiere) on public.profiles to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
