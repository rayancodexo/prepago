-- A promo code grants standard access only. Previously the plan was left untouched,
-- so a lapsed AI+ account regained AI+ by redeeming any code.
create or replace function private.redeem_promo_code_core(input_code text)
 returns table(success boolean, message text, access_ends_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
 v_user uuid:=auth.uid(); v_profile public.profiles%rowtype; v_promo public.promo_codes%rowtype;
 v_end timestamptz; v_attempts integer; v_code text:=upper(btrim(input_code));
begin
 if v_user is null then return query select false,'Connecte-toi pour utiliser un code.'::text,null::timestamptz;return;end if;
 select * into v_profile from public.profiles where id=v_user for update;
 if not found then return query select false,'Profil introuvable. Contacte le support.'::text,null::timestamptz;return;end if;
 insert into private.promo_rate_limits(user_id,window_started_at,attempts) values(v_user,now(),1)
 on conflict(user_id) do update set
 attempts=case when promo_rate_limits.window_started_at<=now()-interval '10 minutes' then 1 else promo_rate_limits.attempts+1 end,
 window_started_at=case when promo_rate_limits.window_started_at<=now()-interval '10 minutes' then now() else promo_rate_limits.window_started_at end
 returning attempts into v_attempts;
 if v_attempts>10 then return query select false,'Trop de tentatives. Réessaie dans 10 minutes.'::text,null::timestamptz;return;end if;
 if v_code is null or v_code !~ '^[A-Z0-9_-]{3,64}$' then return query select false,'Saisis un code promo valide.'::text,null::timestamptz;return;end if;
 if v_profile.subscription_status='active' and (v_profile.subscription_ends_at is null or v_profile.subscription_ends_at>now()) then
 return query select false,'Ton abonnement est déjà actif.'::text,v_profile.subscription_ends_at;return;end if;
 select * into v_promo from public.promo_codes where upper(btrim(code))=v_code for update;
 if not found then return query select false,'Ce code promo est invalide.'::text,null::timestamptz;return;end if;
 if exists(select 1 from public.promo_redemptions where user_id=v_user and promo_code_id=v_promo.id) then
 return query select false,'Ce code a déjà été utilisé sur ton compte.'::text,null::timestamptz;return;end if;
 if not v_promo.active then return query select false,'Ce code promo est désactivé.'::text,null::timestamptz;return;end if;
 if v_promo.expires_at<=now() then return query select false,'Ce code promo a expiré.'::text,null::timestamptz;return;end if;
 if v_promo.max_uses is not null and v_promo.used_count>=v_promo.max_uses then
 return query select false,'Ce code a atteint sa limite d’utilisation.'::text,null::timestamptz;return;end if;
 v_end:=greatest(now(),case when v_profile.subscription_status='trial' then v_profile.trial_ends_at
 when v_profile.subscription_status='promo' then v_profile.subscription_ends_at else null end)+make_interval(days=>v_promo.duration_days);
 insert into public.promo_redemptions(user_id,promo_code_id,access_ends_at) values(v_user,v_promo.id,v_end);
 update public.promo_codes set used_count=used_count+1 where id=v_promo.id;
 update public.profiles set subscription_status='promo',subscription_plan='standard',subscription_ends_at=v_end where id=v_user;
 return query select true,'Code activé. Ton accès est débloqué.'::text,v_end;
end;
$function$;
