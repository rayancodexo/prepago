create schema if not exists private;

create or replace function private.redeem_promo_code_core(input_code text)
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

  if exists (select 1 from public.promo_redemptions r where r.user_id = v_user_id) then
    return query
      select false,
             'A promo code has already been used on this account'::text,
             r.access_ends_at
      from public.promo_redemptions r
      where r.user_id = v_user_id;
    return;
  end if;

  select * into v_promo
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

  update public.promo_codes set used_count = used_count + 1 where id = v_promo.id;

  update public.profiles
  set subscription_status = 'promo',
      subscription_ends_at = v_access_ends_at
  where id = v_user_id;

  return query select true, 'Promo code activated'::text, v_access_ends_at;
end;
$$;

revoke all on function private.redeem_promo_code_core(text) from public;
revoke all on function private.redeem_promo_code_core(text) from anon;
grant usage on schema private to authenticated;
grant execute on function private.redeem_promo_code_core(text) to authenticated;

create or replace function public.redeem_promo_code(input_code text)
returns table (
  success boolean,
  message text,
  access_ends_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.redeem_promo_code_core(input_code);
$$;

revoke all on function public.redeem_promo_code(text) from public;
revoke all on function public.redeem_promo_code(text) from anon;
grant execute on function public.redeem_promo_code(text) to authenticated;

-- Explicit deny policy: promo code catalog is not directly browsable by students.
create policy "Promo codes are not directly readable"
on public.promo_codes
for select
to authenticated
using (false);
