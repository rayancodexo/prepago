-- Serialize concurrent redemption by account before checking its redemption history.
create or replace function private.redeem_promo_code_core(input_code text)
returns table(success boolean,message text,access_ends_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_promo public.promo_codes%rowtype;
  v_end timestamptz;
begin
  if v_user is null then return query select false,'Authentication required'::text,null::timestamptz; return; end if;
  select * into v_profile from public.profiles where id=v_user for update;
  if not found then return query select false,'Profil introuvable. Contactez le support.'::text,null::timestamptz; return; end if;
  if input_code is null or btrim(input_code)='' or length(input_code)>100 then
    return query select false,'Enter a promo code'::text,null::timestamptz; return;
  end if;
  if exists(select 1 from public.promo_redemptions where user_id=v_user) then
    return query select false,'A promo code has already been used on this account'::text,null::timestamptz; return;
  end if;
  if v_profile.subscription_status='active' and (v_profile.subscription_ends_at is null or v_profile.subscription_ends_at>now()) then
    return query select false,'Votre abonnement est déjà actif.'::text,v_profile.subscription_ends_at; return;
  end if;
  select * into v_promo from public.promo_codes where upper(code)=upper(btrim(input_code)) for update;
  if not found then return query select false,'Invalid promo code'::text,null::timestamptz; return; end if;
  if not v_promo.active then return query select false,'This promo code is inactive'::text,null::timestamptz; return; end if;
  if v_promo.expires_at<=now() then return query select false,'This promo code has expired'::text,null::timestamptz; return; end if;
  if v_promo.max_uses is not null and v_promo.used_count>=v_promo.max_uses then
    return query select false,'This promo code has reached its usage limit'::text,null::timestamptz; return;
  end if;
  v_end:=greatest(now(),case when v_profile.subscription_status='trial' then v_profile.trial_ends_at else v_profile.subscription_ends_at end)+make_interval(days=>v_promo.duration_days);
  insert into public.promo_redemptions(user_id,promo_code_id,access_ends_at) values(v_user,v_promo.id,v_end);
  update public.promo_codes set used_count=used_count+1 where id=v_promo.id;
  update public.profiles set subscription_status='promo',subscription_ends_at=v_end where id=v_user;
  return query select true,'Promo code activated'::text,v_end;
end;
$$;
