-- New users should not receive an automatic trial.
alter table public.profiles
  alter column trial_started_at drop not null,
  alter column trial_started_at drop default,
  alter column trial_ends_at drop not null,
  alter column trial_ends_at drop default,
  alter column subscription_status set default 'inactive';

-- Promo code definitions. Codes themselves are not directly readable by students.
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  duration_days integer not null check (duration_days > 0),
  active boolean not null default true,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  promo_code_id uuid not null references public.promo_codes(id) on delete restrict,
  redeemed_at timestamptz not null default now(),
  access_ends_at timestamptz not null,
  constraint one_promo_redemption_per_user unique (user_id)
);

alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

-- Students may see only their own redemption record, never the promo-code catalog.
create policy "Users can view own promo redemption"
on public.promo_redemptions
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Redeem a promo code atomically and securely.
create or replace function public.redeem_promo_code(input_code text)
returns table (
  success boolean,
  message text,
  access_ends_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_promo public.promo_codes%rowtype;
  v_access_ends_at timestamptz;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return query select false, 'Authentication required'::text, null::timestamptz;
    return;
  end if;

  if input_code is null or btrim(input_code) = '' then
    return query select false, 'Enter a promo code'::text, null::timestamptz;
    return;
  end if;

  if exists (
    select 1 from public.promo_redemptions r where r.user_id = v_user_id
  ) then
    return query
      select false,
             'A promo code has already been used on this account'::text,
             r.access_ends_at
      from public.promo_redemptions r
      where r.user_id = v_user_id;
    return;
  end if;

  select *
    into v_promo
  from public.promo_codes p
  where upper(p.code) = upper(btrim(input_code))
  for update;

  if not found then
    return query select false, 'Invalid promo code'::text, null::timestamptz;
    return;
  end if;

  if not v_promo.active then
    return query select false, 'This promo code is inactive'::text, null::timestamptz;
    return;
  end if;

  if v_promo.expires_at is not null and v_promo.expires_at <= now() then
    return query select false, 'This promo code has expired'::text, null::timestamptz;
    return;
  end if;

  if v_promo.max_uses is not null and v_promo.used_count >= v_promo.max_uses then
    return query select false, 'This promo code has reached its usage limit'::text, null::timestamptz;
    return;
  end if;

  v_access_ends_at := now() + make_interval(days => v_promo.duration_days);

  insert into public.promo_redemptions (user_id, promo_code_id, access_ends_at)
  values (v_user_id, v_promo.id, v_access_ends_at);

  update public.promo_codes
  set used_count = used_count + 1
  where id = v_promo.id;

  update public.profiles
  set subscription_status = 'promo',
      subscription_ends_at = v_access_ends_at
  where id = v_user_id;

  return query select true, 'Promo code activated'::text, v_access_ends_at;
end;
$$;

revoke all on function public.redeem_promo_code(text) from public;
revoke all on function public.redeem_promo_code(text) from anon;
grant execute on function public.redeem_promo_code(text) to authenticated;

-- Update app-state access rules to recognize promo access too.
drop policy if exists "Users can view own app state" on public.student_app_state;
drop policy if exists "Users can insert own app state" on public.student_app_state;
drop policy if exists "Users can update own app state" on public.student_app_state;

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
        or (p.subscription_status in ('active','promo') and (p.subscription_ends_at is null or p.subscription_ends_at > now()))
      )
  )
);

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
        or (p.subscription_status in ('active','promo') and (p.subscription_ends_at is null or p.subscription_ends_at > now()))
      )
  )
);

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
        or (p.subscription_status in ('active','promo') and (p.subscription_ends_at is null or p.subscription_ends_at > now()))
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
        or (p.subscription_status in ('active','promo') and (p.subscription_ends_at is null or p.subscription_ends_at > now()))
      )
  )
);

-- Initial launch code: 30 days, maximum 300 accounts. No fixed expiry; disable it when launch ends.
-- The real launch code is redacted in this public copy; it exists only in the database.
insert into public.promo_codes (code, duration_days, active, max_uses)
values ('REDACTED_LAUNCH_CODE', 30, true, 300)
on conflict (code) do update
set duration_days = excluded.duration_days,
    active = excluded.active,
    max_uses = excluded.max_uses;
