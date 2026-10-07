-- Add optional links without rewriting existing history or user data.
alter table public.study_sessions add column if not exists project_id text, add column if not exists task_id text, add column if not exists event_id text;
create or replace function public.study_action(p_action text,p_id uuid,p_revision integer default null,p_payload jsonb default '{}'::jsonb)
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
  if nullif(p_payload->>'projectId','') is not null and not exists(select 1 from jsonb_array_elements(coalesce(d->'projects','[]'::jsonb)) p where p->>'id'=p_payload->>'projectId') then raise exception 'Project no longer available'; end if;
  if nullif(p_payload->>'taskId','') is not null and not exists(select 1 from jsonb_array_elements(coalesce(d->'tasks','[]'::jsonb)) p where p->>'id'=p_payload->>'taskId') then raise exception 'Task no longer available'; end if;
  if nullif(p_payload->>'eventId','') is not null and not exists(select 1 from jsonb_array_elements(coalesce(d->'events','[]'::jsonb)) p where p->>'id'=p_payload->>'eventId') then raise exception 'Event no longer available'; end if;
  insert into public.study_sessions(id,user_id,subject_id,chapter_id,subject_name,chapter_name,started_at,resumed_at,focus_duration,break_duration,cycles,cycle_index,kind,session_goal,notes,project_id,task_id,event_id)
  values(p_id,u,subj->>'id',ch->>'id',coalesce(subj->>'name',''),coalesce(ch->>'name',''),t,t,(p_payload->>'work')::integer*60,(p_payload->>'break')::integer*60,coalesce((p_payload->>'cycles')::integer,1),coalesce((p_payload->>'cycleIndex')::integer,1),coalesce(p_payload->>'kind','work'),left(coalesce(p_payload->>'goal',''),240),left(coalesce(p_payload->>'notes',''),4000),nullif(p_payload->>'projectId',''),nullif(p_payload->>'taskId',''),nullif(p_payload->>'eventId','')) returning * into r;
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
