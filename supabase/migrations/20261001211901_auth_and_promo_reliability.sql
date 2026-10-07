-- Keep existing users, subscriptions, codes and redemption history intact.
create index if not exists promo_redemptions_promo_code_id_idx on public.promo_redemptions(promo_code_id);
create unique index if not exists promo_codes_normalized_code_idx on public.promo_codes(upper(btrim(code)));
alter table public.promo_redemptions drop constraint one_promo_redemption_per_user;
alter table public.promo_redemptions add constraint one_redemption_per_user_and_code unique(user_id,promo_code_id);

-- Only administrators may list codes. All mutations go through a checked RPC.
drop policy if exists "Promo codes are not directly readable" on public.promo_codes;
create policy promo_admin_read on public.promo_codes for select to authenticated
using (exists(select 1 from public.user_roles where user_id=(select auth.uid()) and role='admin'));
grant select on public.promo_codes to authenticated;
revoke insert,update,delete,truncate,references,trigger on public.promo_codes from anon,authenticated;

create table private.promo_rate_limits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_started_at timestamptz not null default now(),
 attempts integer not null default 0 check(attempts>=0)
);
alter table private.promo_rate_limits enable row level security;
revoke all on private.promo_rate_limits from public,anon,authenticated;

create or replace function private.redeem_promo_code_core(input_code text)
returns table(success boolean,message text,access_ends_at timestamptz)
language plpgsql security definer set search_path='' as $$
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
 update public.profiles set subscription_status='promo',subscription_ends_at=v_end where id=v_user;
 return query select true,'Code activé. Ton accès est débloqué.'::text,v_end;
end;
$$;
revoke execute on function private.redeem_promo_code_core(text) from public,anon;
grant execute on function private.redeem_promo_code_core(text) to authenticated;

create function private.admin_save_promo_code_core(promo_id uuid,input_code text,input_duration_days integer,input_max_uses integer,input_expires_at timestamptz,input_active boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_code text:=upper(btrim(input_code)); v_existing public.promo_codes%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin') then
 raise exception 'Administrateur requis.' using errcode='42501';end if;
 if v_code is null or v_code !~ '^[A-Z0-9_-]{3,64}$' then raise exception 'Utilise 3 à 64 lettres, chiffres, tirets ou underscores.' using errcode='22023';end if;
 if input_duration_days is null or input_duration_days not between 1 and 3650 then raise exception 'La durée doit être comprise entre 1 et 3650 jours.' using errcode='22023';end if;
 if input_max_uses is not null and input_max_uses<1 then raise exception 'La limite doit être positive.' using errcode='22023';end if;
 if input_active is null then raise exception 'Statut requis.' using errcode='22023';end if;
 if promo_id is null then
 insert into public.promo_codes(code,duration_days,max_uses,expires_at,active) values(v_code,input_duration_days,input_max_uses,input_expires_at,input_active) returning id into v_id;
 else
 select * into v_existing from public.promo_codes where id=promo_id for update;
 if not found then raise exception 'Code introuvable.' using errcode='22023';end if;
 if upper(btrim(v_existing.code))<>v_code then raise exception 'Le nom d’un code existant ne peut pas être modifié.' using errcode='22023';end if;
 if input_max_uses is not null and input_max_uses<v_existing.used_count then raise exception 'La limite ne peut pas être inférieure aux utilisations déjà effectuées.' using errcode='22023';end if;
 update public.promo_codes set duration_days=input_duration_days,max_uses=input_max_uses,expires_at=input_expires_at,active=input_active where id=promo_id returning id into v_id;
 end if;
 return v_id;
end;
$$;
create function public.admin_save_promo_code(promo_id uuid,input_code text,input_duration_days integer,input_max_uses integer,input_expires_at timestamptz,input_active boolean)
returns uuid language sql security invoker set search_path='' as $$
 select private.admin_save_promo_code_core(promo_id,input_code,input_duration_days,input_max_uses,input_expires_at,input_active);
$$;
revoke execute on function private.admin_save_promo_code_core(uuid,text,integer,integer,timestamptz,boolean) from public,anon;
revoke execute on function public.admin_save_promo_code(uuid,text,integer,integer,timestamptz,boolean) from public,anon;
grant execute on function private.admin_save_promo_code_core(uuid,text,integer,integer,timestamptz,boolean),public.admin_save_promo_code(uuid,text,integer,integer,timestamptz,boolean) to authenticated;

-- Align the access policies with the client: promo access always has an expiry.
drop policy "Users can view own app state" on public.student_app_state;
drop policy "Users can insert own app state" on public.student_app_state;
drop policy "Users can update own app state" on public.student_app_state;
create policy "Users can view own app state" on public.student_app_state for select to authenticated using(
 (select auth.uid())=user_id and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and (
 (p.subscription_status='active' and (p.subscription_ends_at is null or p.subscription_ends_at>now())) or
 (p.subscription_status='promo' and p.subscription_ends_at>now()) or (p.subscription_status='trial' and p.trial_ends_at>now()))));
create policy "Users can insert own app state" on public.student_app_state for insert to authenticated with check(
 (select auth.uid())=user_id and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and (
 (p.subscription_status='active' and (p.subscription_ends_at is null or p.subscription_ends_at>now())) or
 (p.subscription_status='promo' and p.subscription_ends_at>now()) or (p.subscription_status='trial' and p.trial_ends_at>now()))));
create policy "Users can update own app state" on public.student_app_state for update to authenticated using(
 (select auth.uid())=user_id and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and (
 (p.subscription_status='active' and (p.subscription_ends_at is null or p.subscription_ends_at>now())) or
 (p.subscription_status='promo' and p.subscription_ends_at>now()) or (p.subscription_status='trial' and p.trial_ends_at>now())))) with check(
 (select auth.uid())=user_id and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and (
 (p.subscription_status='active' and (p.subscription_ends_at is null or p.subscription_ends_at>now())) or
 (p.subscription_status='promo' and p.subscription_ends_at>now()) or (p.subscription_status='trial' and p.trial_ends_at>now()))));

-- Email is controlled by Supabase Auth, and must stay synchronized in profiles.
create function private.sync_profile_email() returns trigger language plpgsql security definer set search_path='' as $$
begin update public.profiles set email=new.email where id=new.id;return new;end;
$$;
revoke execute on function private.sync_profile_email() from public,anon,authenticated;
create trigger prepago_sync_profile_email after update of email on auth.users for each row when(old.email is distinct from new.email) execute function private.sync_profile_email();
update public.profiles p set email=u.email from auth.users u where p.id=u.id and p.email is distinct from u.email;
