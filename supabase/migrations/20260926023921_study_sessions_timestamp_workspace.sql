-- Timestamp-authoritative focus sessions. Existing workspace JSON is retained.
create table public.study_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 config jsonb not null default '{}'::jsonb,
 legacy_imported boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.study_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 subject_id text, chapter_id text, subject_name text not null default '', chapter_name text not null default '',
 started_at timestamptz not null default now(), ended_at timestamptz, resumed_at timestamptz,
 duration_seconds double precision not null default 0 check(duration_seconds>=0),
 focus_duration integer not null check(focus_duration between 60 and 10800),
 break_duration integer not null default 300 check(break_duration between 60 and 3600),
 cycles integer not null default 1 check(cycles between 1 and 12), cycle_index integer not null default 1,
 kind text not null default 'work' check(kind in ('work','break')),
 session_goal text not null default '' check(length(session_goal)<=240),
 notes text not null default '' check(length(notes)<=4000),
 status text not null default 'active' check(status in ('active','paused','completed','cancelled')),
 segments jsonb not null default '[]'::jsonb,
 revision integer not null default 0,
 legacy_key text, legacy_date date, deleted_at timestamptz,
 created_at timestamptz not null default now(),
 unique(user_id,legacy_key)
);
create unique index study_one_live on public.study_sessions(user_id) where status in ('active','paused') and deleted_at is null;
create index study_owner_started on public.study_sessions(user_id,started_at desc);
alter table public.study_settings enable row level security;
alter table public.study_sessions enable row level security;
create policy study_settings_own on public.study_settings for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy study_sessions_own on public.study_sessions for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.study_sessions,public.study_settings from anon;
grant select,insert,update on public.study_sessions,public.study_settings to authenticated;

create function public.study_bootstrap() returns jsonb language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); d jsonb; item jsonb; n integer:=0; sec double precision; k text; sid text; sn text; cfg jsonb; oldrun jsonb; parts jsonb; v_imported boolean;
begin
 if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,42));
 select data into d from public.student_app_state where user_id=u;
 cfg:=coalesce(d->'focusSettings','{}'::jsonb);
 insert into public.study_settings(user_id,config) values(u,jsonb_build_object('work',coalesce(cfg->'work','25'::jsonb),'break',coalesce(cfg->'break','5'::jsonb),'dailyHours',coalesce(cfg->'goal','4'::jsonb),'cycles',1,'streakMinutes',30,'sound',coalesce(cfg->'endSound','true'::jsonb),'subjectId','','chapterId','','goal',coalesce(cfg->>'objective',''),'notes','')) on conflict do nothing;
 select legacy_imported into v_imported from public.study_settings where user_id=u;
 for item in select value from jsonb_array_elements(coalesce(d->'focusSessions','[]'::jsonb)) loop
  n:=n+1;
  if item->>'source'='focus_v2' or coalesce(item->>'minutes','') !~ '^\d+(\.\d+)?$' or coalesce(item->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then continue; end if;
  sec:=(item->>'minutes')::double precision*60;
  if sec<=0 then continue; end if;
  k:=coalesce(item->>'id','legacy-'||md5(item::text)||'-'||n);
  sn:=coalesce(item->>'subject','');
  select s->>'id' into sid from jsonb_array_elements(coalesce(d->'subjects','[]'::jsonb)) s where s->>'name'=sn limit 1;
  insert into public.study_sessions(user_id,subject_id,subject_name,started_at,ended_at,duration_seconds,focus_duration,session_goal,status,legacy_key,legacy_date)
  values(u,sid,sn,(item->>'date')::date::timestamptz,(item->>'date')::date::timestamptz,sec,greatest(60,least(10800,ceil(sec)::integer)),left(coalesce(item->>'objective',''),240),'completed',k,(item->>'date')::date) on conflict(user_id,legacy_key) do nothing;
 end loop;
 -- Preserve time already checkpointed by the old timer. Do not invent unattended time.
 if not v_imported then
  oldrun:=d->'focusRun';
  select coalesce(sum(value::double precision),0) into sec from jsonb_each_text(coalesce(oldrun->'segments','{}'::jsonb)) where value ~ '^\d+(\.\d+)?$';
  if sec>0 and oldrun->>'mode'='work' and not exists(select 1 from public.study_sessions where user_id=u and status in ('active','paused')) then
   select coalesce(jsonb_agg(jsonb_build_object('date',key,'seconds',value::double precision)),'[]'::jsonb) into parts from jsonb_each_text(coalesce(oldrun->'segments','{}'::jsonb)) where value ~ '^\d+(\.\d+)?$';
   insert into public.study_sessions(user_id,subject_name,duration_seconds,focus_duration,session_goal,status,segments,legacy_key)
   values(u,coalesce(oldrun->>'subject',''),sec,greatest(60,least(10800,coalesce((oldrun->>'duration')::integer,1500))),left(coalesce(oldrun->>'objective',''),240),'paused',parts,'legacy-active');
  end if;
  update public.study_settings set legacy_imported=true where user_id=u;
 end if;
 return jsonb_build_object('server_now',clock_timestamp());
end $$;
revoke execute on function public.study_bootstrap() from public,anon;
grant execute on function public.study_bootstrap() to authenticated;

create function public.study_action(p_action text,p_id uuid,p_revision integer default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); r public.study_sessions; t timestamptz:=clock_timestamp(); elapsed double precision; cap integer; stop_at timestamptz; subj jsonb; ch jsonb; d jsonb; mismatch boolean:=false;
begin
 if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,42));
 if p_action='start' then
  select * into r from public.study_sessions where user_id=u and id=p_id;
  if found then return jsonb_build_object('session',to_jsonb(r),'server_now',t); end if;
  select * into r from public.study_sessions where user_id=u and status in ('active','paused') and deleted_at is null;
  if found then return jsonb_build_object('session',to_jsonb(r),'server_now',t,'conflict',true); end if;
  select data into d from public.student_app_state where user_id=u;
  if nullif(p_payload->>'subjectId','') is not null then
   select s into subj from jsonb_array_elements(coalesce(d->'subjects','[]'::jsonb)) s where s->>'id'=p_payload->>'subjectId';
   if subj is null then raise exception 'Subject no longer available'; end if;
  end if;
  if nullif(p_payload->>'chapterId','') is not null then
   select c into ch from jsonb_array_elements(coalesce(subj->'chapters','[]'::jsonb)) c where c->>'id'=p_payload->>'chapterId';
   if ch is null then raise exception 'Chapter no longer available'; end if;
  end if;
  insert into public.study_sessions(id,user_id,subject_id,chapter_id,subject_name,chapter_name,started_at,resumed_at,focus_duration,break_duration,cycles,cycle_index,kind,session_goal,notes)
  values(p_id,u,subj->>'id',ch->>'id',coalesce(subj->>'name',''),coalesce(ch->>'name',''),t,t,(p_payload->>'work')::integer*60,(p_payload->>'break')::integer*60,coalesce((p_payload->>'cycles')::integer,1),coalesce((p_payload->>'cycleIndex')::integer,1),coalesce(p_payload->>'kind','work'),left(coalesce(p_payload->>'goal',''),240),left(coalesce(p_payload->>'notes',''),4000)) returning * into r;
 else
  select * into r from public.study_sessions where user_id=u and id=p_id for update;
  if not found then raise exception 'Session unavailable' using errcode='42501'; end if;
  if p_revision is not null and p_revision<>r.revision then return jsonb_build_object('session',to_jsonb(r),'server_now',t,'conflict',true); end if;
  if p_action='delete' then
   if r.status in ('active','paused') then raise exception 'Finish session first'; end if;
   update public.study_sessions set deleted_at=t,revision=revision+1 where id=r.id returning * into r;
  elsif r.status in ('active','paused') then
   cap:=case when r.kind='work' then r.focus_duration else r.break_duration end;
   if r.status='active' then
    elapsed:=greatest(0,least(cap-r.duration_seconds,extract(epoch from t-r.resumed_at)));
    stop_at:=r.resumed_at+elapsed*interval '1 second';
    if p_action='settle' and r.duration_seconds+elapsed<cap then return jsonb_build_object('session',to_jsonb(r),'server_now',t); end if;
    if elapsed>0 then r.segments:=r.segments||jsonb_build_array(jsonb_build_object('start',r.resumed_at,'end',stop_at)); end if;
    r.duration_seconds:=r.duration_seconds+elapsed;
   end if;
   if r.duration_seconds>=cap then r.status:='completed';r.ended_at:=coalesce(stop_at,t);r.resumed_at:=null;
   elsif p_action='pause' then r.status:='paused';r.resumed_at:=null;
   elsif p_action='resume' and r.status='paused' then r.status:='active';r.resumed_at:=t;
   elsif p_action='finish' then r.status:='cancelled';r.ended_at:=t;r.resumed_at:=null;
   elsif p_action='settle' then return jsonb_build_object('session',to_jsonb(r),'server_now',t);
   else raise exception 'Invalid session action';end if;
   update public.study_sessions set duration_seconds=r.duration_seconds,segments=r.segments,status=r.status,ended_at=r.ended_at,resumed_at=r.resumed_at,revision=revision+1 where id=r.id returning * into r;
  end if;
 end if;
 return jsonb_build_object('session',to_jsonb(r),'server_now',t);
end $$;
revoke execute on function public.study_action(text,uuid,integer,jsonb) from public,anon;
grant execute on function public.study_action(text,uuid,integer,jsonb) to authenticated;
