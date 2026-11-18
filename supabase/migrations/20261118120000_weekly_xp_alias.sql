-- A student can appear in the weekly classement under a pseudonym they choose. Their XP stays
-- the server's count; with a pseudonym their filière is hidden too. Only the student sets it.
alter table private.weekly_xp_preferences add column alias text
 check (alias is null or (char_length(alias) between 2 and 20 and alias ~ '^[[:alnum:]À-ÿ][[:alnum:]À-ÿ _.-]*$'
  and lower(alias) not in ('prepago','admin','administrateur','toi','moi','rival','étudiant','etudiant','support')));
create unique index weekly_xp_preferences_alias_unique on private.weekly_xp_preferences(lower(alias)) where alias is not null;

create or replace function private.weekly_xp_leaderboard_core() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); week_local timestamp:=date_trunc('week',clock_timestamp() at time zone 'Africa/Casablanca'); result jsonb;
begin
 if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=u and ((subscription_status='active' and (subscription_ends_at is null or subscription_ends_at>now())) or (subscription_status='promo' and subscription_ends_at>now()) or (subscription_status='trial' and trial_ends_at>now()))) then
  raise exception 'Active access required' using errcode='42501';
 end if;
 with totals as (
  select user_id,sum(amount)::bigint as xp,max(earned_at) as reached_at
  from private.weekly_xp_awards where not baseline and amount>0
   and earned_at>=week_local at time zone 'Africa/Casablanca'
   and earned_at<(week_local+interval '7 days') at time zone 'Africa/Casablanca'
  group by user_id
 ), ranked as (
  select row_number() over(order by t.xp desc,t.reached_at,t.user_id) as position,t.user_id,t.xp,
   case when pref.alias is not null then null else p.filiere end as filiere,
   pref.alias is not null as is_alias,
   case when pref.alias is not null then pref.alias
    when nullif(btrim(p.full_name),'') is null then 'Étudiant' else
    left(split_part(btrim(p.full_name),' ',1),30)||case when strpos(btrim(p.full_name),' ')>0 then ' '||upper(left(regexp_replace(btrim(p.full_name),'^.*\s+',''),1))||'.' else '' end end as display_name
  from totals t join public.profiles p on p.id=t.user_id
  left join private.weekly_xp_preferences pref on pref.user_id=t.user_id
  where coalesce(pref.participating,true) and not exists(select 1 from public.user_roles r where r.user_id=t.user_id and r.role='admin')
 )
 select jsonb_build_object(
  'week_start',week_local::date,'week_end',(week_local+interval '6 days')::date,
  'ends_at',(week_local+interval '7 days') at time zone 'Africa/Casablanca','timezone','Africa/Casablanca',
  'counting_started_at',(select counting_started_at from private.weekly_xp_config where singleton),
  'updated_at',clock_timestamp(),'participants',(select count(*) from ranked),
  'top10',coalesce((select jsonb_agg(jsonb_build_object('position',position,'display_name',display_name,'filiere',filiere,'xp',xp,'is_self',user_id=u,'is_alias',is_alias) order by position) from (select * from ranked order by position limit 10) r),'[]'::jsonb),
  'self',jsonb_build_object('position',(select position from ranked where user_id=u),'xp',coalesce((select xp from totals where user_id=u),0),
   'participating',coalesce((select participating from private.weekly_xp_preferences where user_id=u),true),
   'alias',(select alias from private.weekly_xp_preferences where user_id=u),
   'is_admin',exists(select 1 from public.user_roles where user_id=u and role='admin'))
 ) into result;
 return result;
end $$;

-- Setting a pseudonym also turns participation on; an empty value removes it.
create function private.set_weekly_xp_alias_core(new_alias text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare clean text:=nullif(regexp_replace(btrim(coalesce(new_alias,'')),'\s+',' ','g'),'');
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if clean is not null and exists(select 1 from private.weekly_xp_preferences where lower(alias)=lower(clean) and user_id<>auth.uid()) then
  raise exception 'Ce pseudo est déjà pris.' using errcode='23505';
 end if;
 insert into private.weekly_xp_preferences(user_id,participating,alias) values(auth.uid(),true,clean)
 on conflict(user_id) do update set alias=excluded.alias,participating=case when excluded.alias is not null then true else private.weekly_xp_preferences.participating end;
 return private.weekly_xp_leaderboard_core();
end $$;
create function public.set_weekly_xp_alias(new_alias text) returns jsonb language sql security invoker set search_path='' as $$ select private.set_weekly_xp_alias_core(new_alias); $$;
revoke all on function private.set_weekly_xp_alias_core(text),public.set_weekly_xp_alias(text) from public,anon,authenticated;
grant execute on function private.set_weekly_xp_alias_core(text),public.set_weekly_xp_alias(text) to authenticated;

-- Admin: give a student's account a pseudonym (with the student's consent, asked outside the app).
-- The score shown is still that account's real weekly XP; no score can be typed in.
create function private.admin_weekly_xp_aliases_core() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('email',p.email,'name',p.full_name,'alias',pref.alias,'participating',pref.participating) order by lower(pref.alias))
  from private.weekly_xp_preferences pref join public.profiles p on p.id=pref.user_id where pref.alias is not null),'[]'::jsonb);
end $$;
create function private.admin_set_weekly_xp_alias_core(student_email text,new_alias text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; clean text:=nullif(regexp_replace(btrim(coalesce(new_alias,'')),'\s+',' ','g'),'');
begin
 if not exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
 select id into target from public.profiles where lower(email)=lower(btrim(coalesce(student_email,''))) limit 1;
 if target is null then raise exception 'Aucun compte avec cet e-mail.' using errcode='P0002'; end if;
 if clean is not null and exists(select 1 from private.weekly_xp_preferences where lower(alias)=lower(clean) and user_id<>target) then
  raise exception 'Ce pseudo est déjà pris.' using errcode='23505';
 end if;
 insert into private.weekly_xp_preferences(user_id,participating,alias) values(target,true,clean)
 on conflict(user_id) do update set alias=excluded.alias,participating=case when excluded.alias is not null then true else private.weekly_xp_preferences.participating end;
 return private.admin_weekly_xp_aliases_core();
end $$;
create function public.admin_weekly_xp_aliases() returns jsonb language sql security invoker set search_path='' as $$ select private.admin_weekly_xp_aliases_core(); $$;
create function public.admin_set_weekly_xp_alias(student_email text,new_alias text) returns jsonb language sql security invoker set search_path='' as $$ select private.admin_set_weekly_xp_alias_core(student_email,new_alias); $$;
revoke all on function private.admin_weekly_xp_aliases_core(),private.admin_set_weekly_xp_alias_core(text,text),public.admin_weekly_xp_aliases(),public.admin_set_weekly_xp_alias(text,text) from public,anon,authenticated;
grant execute on function private.admin_weekly_xp_aliases_core(),private.admin_set_weekly_xp_alias_core(text,text),public.admin_weekly_xp_aliases(),public.admin_set_weekly_xp_alias(text,text) to authenticated;
