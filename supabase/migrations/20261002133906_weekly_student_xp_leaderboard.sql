-- Weekly XP is an append-only record of first completions, never a client XP total.
create table private.weekly_xp_config (
 singleton boolean primary key default true check(singleton),
 counting_started_at timestamptz not null default clock_timestamp()
);
insert into private.weekly_xp_config(singleton) values(true);
create table private.weekly_xp_awards (
 user_id uuid not null references auth.users(id) on delete cascade,
 award_key text not null,
 amount integer not null check(amount between 0 and 360),
 earned_at timestamptz not null default clock_timestamp(),
 baseline boolean not null default false,
 primary key(user_id,award_key)
);
create index weekly_xp_awards_week on private.weekly_xp_awards(earned_at,user_id) include(amount) where not baseline and amount>0;
create table private.weekly_xp_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 participating boolean not null default true
);
create table private.weekly_xp_focus_starts (
 session_id uuid primary key references public.study_sessions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 observed_at timestamptz not null default clock_timestamp()
);
alter table private.weekly_xp_config enable row level security;
alter table private.weekly_xp_awards enable row level security;
alter table private.weekly_xp_preferences enable row level security;
alter table private.weekly_xp_focus_starts enable row level security;
revoke all on private.weekly_xp_config,private.weekly_xp_awards,private.weekly_xp_preferences,private.weekly_xp_focus_starts from public,anon,authenticated;

-- Guard malformed optional workspace data and include archived programmes.
create function private.workspace_xp_items(d jsonb)
returns table(award_key text,amount integer)
language sql immutable security invoker set search_path='' as $$
 with subject_sets as (
  select d->'subjects' as items
  union all
  select value->'subjects' from jsonb_each(case when jsonb_typeof(d#>'{curriculum,archives}')='object' then d#>'{curriculum,archives}' else '{}'::jsonb end)
 ), chapters as (
  select s->>'id' as subject_id,c
  from subject_sets cross join lateral jsonb_array_elements(case when jsonb_typeof(items)='array' then items else '[]'::jsonb end) s
  cross join lateral jsonb_array_elements(case when jsonb_typeof(s->'chapters')='array' then s->'chapters' else '[]'::jsonb end) c
  where length(s->>'id') between 1 and 160 and length(coalesce(c->>'curriculumId',c->>'id')) between 1 and 180
 ), awards as (
  select 'chapter:'||md5(jsonb_build_array(subject_id,coalesce(c->>'curriculumId',c->>'id'),v.step)::text) as award_key,v.points as amount
  from chapters cross join (values ('course',10),('summary',15),('easy',20),('advanced',30)) v(step,points)
  where c->'steps'->v.step='true'::jsonb
  union
  select 'chapter:'||md5(jsonb_build_array(subject_id,coalesce(c->>'curriculumId',c->>'id'),'done')::text),25
  from chapters where c->'done'='true'::jsonb and c#>'{steps,course}'='true'::jsonb and c#>'{steps,summary}'='true'::jsonb and c#>'{steps,easy}'='true'::jsonb and c#>'{steps,advanced}'='true'::jsonb
  union
  select 'task:'||md5(t->>'id'),25
  from jsonb_array_elements(case when jsonb_typeof(d->'tasks')='array' then d->'tasks' else '[]'::jsonb end) t
  where t->'done'='true'::jsonb and length(t->>'id') between 1 and 160
  union
  select 'cnc:'||md5(jsonb_build_array(p->>'filiere',p->>'subject',p->>'year')::text),150
  from jsonb_each(case when jsonb_typeof(d#>'{cnc,papers}')='object' then d#>'{cnc,papers}' else '{}'::jsonb end) e(k,p)
  where p->'done'='true'::jsonb and p->>'filiere' in ('MP','PSI','TSI','ECS','ECT','EST')
   and length(p->>'subject') between 1 and 100 and p->>'year' ~ '^(19|20)[0-9]{2}$'
 ) select * from awards;
$$;
revoke all on function private.workspace_xp_items(jsonb) from public,anon,authenticated;

-- Existing completed work is a baseline, not XP earned at feature launch.
insert into private.weekly_xp_awards(user_id,award_key,amount,baseline)
select s.user_id,a.award_key,a.amount,true from public.student_app_state s cross join lateral private.workspace_xp_items(s.data) a on conflict do nothing;
insert into private.weekly_xp_awards(user_id,award_key,amount,baseline)
select user_id,'focus:'||id,0,true from public.study_sessions where status not in ('active','paused') or legacy_key is not null on conflict do nothing;
insert into private.weekly_xp_focus_starts(session_id,user_id)
select id,user_id from public.study_sessions where status in ('active','paused') and kind='work' and legacy_key is null;

create function private.track_workspace_weekly_xp() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- First import of a workspace never turns historical completions into new XP.
 insert into private.weekly_xp_awards(user_id,award_key,amount,baseline)
 select new.user_id,a.award_key,a.amount,tg_op='INSERT' from private.workspace_xp_items(new.data) a on conflict do nothing;
 return new;
end $$;
revoke all on function private.track_workspace_weekly_xp() from public,anon,authenticated;
create trigger track_workspace_weekly_xp after insert or update of data on public.student_app_state for each row execute function private.track_workspace_weekly_xp();

create function private.track_focus_weekly_xp() returns trigger
language plpgsql security definer set search_path='' as $$
declare started timestamptz; points integer;
begin
 if tg_op='INSERT' then
  if new.status='active' and new.kind='work' and new.legacy_key is null then
   insert into private.weekly_xp_focus_starts(session_id,user_id) values(new.id,new.user_id) on conflict do nothing;
  end if;
 elsif new.status='completed' and old.status in ('active','paused') and new.kind='work' and old.kind='work'
  and new.legacy_key is null and new.deleted_at is null and new.user_id=old.user_id then
  select observed_at into started from private.weekly_xp_focus_starts where session_id=new.id and user_id=new.user_id;
  if started is not null then
   -- A claimed duration cannot exceed time observed by the server, or the session cap.
   points:=floor(greatest(0,least(new.duration_seconds,extract(epoch from clock_timestamp()-started),new.focus_duration::numeric,10800))/30)::integer;
   insert into private.weekly_xp_awards(user_id,award_key,amount) values(new.user_id,'focus:'||new.id,points) on conflict do nothing;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.track_focus_weekly_xp() from public,anon,authenticated;
create trigger track_focus_weekly_xp after insert or update on public.study_sessions for each row execute function private.track_focus_weekly_xp();

create function private.weekly_xp_leaderboard_core() returns jsonb
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
  select row_number() over(order by t.xp desc,t.reached_at,t.user_id) as position,t.user_id,t.xp,p.filiere,
   case when nullif(btrim(p.full_name),'') is null then 'Étudiant' else
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
  'top10',coalesce((select jsonb_agg(jsonb_build_object('position',position,'display_name',display_name,'filiere',filiere,'xp',xp,'is_self',user_id=u) order by position) from (select * from ranked order by position limit 10) r),'[]'::jsonb),
  'self',jsonb_build_object('position',(select position from ranked where user_id=u),'xp',coalesce((select xp from totals where user_id=u),0),
   'participating',coalesce((select participating from private.weekly_xp_preferences where user_id=u),true),
   'is_admin',exists(select 1 from public.user_roles where user_id=u and role='admin'))
 ) into result;
 return result;
end $$;
create function private.set_weekly_xp_participation_core(enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if enabled is null then raise exception 'Participation required'; end if;
 insert into private.weekly_xp_preferences(user_id,participating) values(auth.uid(),enabled)
 on conflict(user_id) do update set participating=excluded.participating;
 return private.weekly_xp_leaderboard_core();
end $$;
create function public.weekly_xp_leaderboard() returns jsonb language sql security invoker set search_path='' as $$ select private.weekly_xp_leaderboard_core(); $$;
create function public.set_weekly_xp_participation(enabled boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.set_weekly_xp_participation_core(enabled); $$;
revoke all on function private.weekly_xp_leaderboard_core(),private.set_weekly_xp_participation_core(boolean),public.weekly_xp_leaderboard(),public.set_weekly_xp_participation(boolean) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.weekly_xp_leaderboard_core(),private.set_weekly_xp_participation_core(boolean),public.weekly_xp_leaderboard(),public.set_weekly_xp_participation(boolean) to authenticated;
