-- Simulateur de colle and Mode Épreuve. Grading is self-assessed for now: grading_method and
-- ai_feedback stay on every attempt so an AI grader can be added later without new tables.
-- The old "Colles et DS" grades live in student_app_state (data.grades) and are left untouched.

-- Same access rule as the CNC catalogue: active, promo or trial access that has not ended.
create function public.prepago_has_access() returns boolean language sql stable security invoker
set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and (
  (p.subscription_status='active' and (p.subscription_ends_at is null or p.subscription_ends_at>now())) or
  (p.subscription_status='promo' and p.subscription_ends_at>now()) or
  (p.subscription_status='trial' and p.trial_ends_at>now())));
$$;
revoke all on function public.prepago_has_access() from public,anon;
grant execute on function public.prepago_has_access() to authenticated;

-- ==== Shape checks for JSON columns =======================================================
create function private.valid_colle_checklist(items jsonb) returns boolean language sql immutable
set search_path='' as $$
 select jsonb_typeof(items)='array' and jsonb_array_length(items) between 3 and 6 and not exists(
  select 1 from jsonb_array_elements(items) i where jsonb_typeof(i)<>'object'
   or jsonb_typeof(i->'label') is distinct from 'string' or length(btrim(i->>'label')) not between 1 and 300
   or case when jsonb_typeof(i->'points')='number' then (i->'points')::numeric not between 0.5 and 20 else true end);
$$;
create function private.valid_colle_traps(items jsonb) returns boolean language sql immutable
set search_path='' as $$
 select jsonb_typeof(items)='array' and jsonb_array_length(items) between 0 and 3 and not exists(
  select 1 from jsonb_array_elements(items) i where jsonb_typeof(i)<>'object'
   or jsonb_typeof(i->'question') is distinct from 'string' or length(btrim(i->>'question')) not between 1 and 500
   or jsonb_typeof(i->'answer') is distinct from 'string' or length(btrim(i->>'answer')) not between 1 and 1000);
$$;
create function private.valid_bareme(items jsonb) returns boolean language sql immutable
set search_path='' as $$
 select jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 60 and not exists(
  select 1 from jsonb_array_elements(items) i where jsonb_typeof(i)<>'object'
   or jsonb_typeof(i->'number') is distinct from 'string' or length(btrim(i->>'number')) not between 1 and 12
   or coalesce(jsonb_typeof(i->'label'),'null') not in ('string','null') or length(coalesce(i->>'label','')) > 200
   or coalesce(jsonb_typeof(i->'chapter'),'null') not in ('string','null') or length(coalesce(i->>'chapter','')) > 160
   or case when jsonb_typeof(i->'max_points')='number' then (i->'max_points')::numeric not between 0.25 and 100 else true end);
$$;
create function private.valid_exam_scores(items jsonb) returns boolean language sql immutable
set search_path='' as $$
 select jsonb_typeof(items)='array' and jsonb_array_length(items) <= 60 and not exists(
  select 1 from jsonb_array_elements(items) i where jsonb_typeof(i)<>'object'
   or jsonb_typeof(i->'number') is distinct from 'string' or length(i->>'number') not between 1 and 12
   or coalesce(jsonb_typeof(i->'chapter'),'null') not in ('string','null') or length(coalesce(i->>'chapter','')) > 160
   or jsonb_typeof(i->'points') is distinct from 'number' or jsonb_typeof(i->'max_points') is distinct from 'number'
   or case when jsonb_typeof(i->'points')='number' and jsonb_typeof(i->'max_points')='number'
       then (i->'max_points')::numeric not between 0.25 and 100 or (i->'points')::numeric not between 0 and (i->'max_points')::numeric
       else true end);
$$;
-- Column checks run as the student who writes the row, so students may call these pure checks.
revoke all on function private.valid_colle_checklist(jsonb),private.valid_colle_traps(jsonb),
 private.valid_bareme(jsonb),private.valid_exam_scores(jsonb) from public,anon;
grant execute on function private.valid_colle_checklist(jsonb),private.valid_colle_traps(jsonb),
 private.valid_bareme(jsonb),private.valid_exam_scores(jsonb) to authenticated;

-- ==== Colle question bank =================================================================
create table public.colle_questions (
 id uuid primary key default gen_random_uuid(),
 filiere text not null check(filiere in ('MPSI','PCSI','MP','PSI','TSI')),
 subject text not null check(subject in ('math','physics','chemistry','engineering')),
 chapter text not null check(length(btrim(chapter)) between 1 and 160),
 chapter_key text check(chapter_key is null or chapter_key ~ '^[a-z]+:(sup|spe):[a-z-]+:[a-z0-9]+$'),
 type text not null check(type in ('cours','exercice')),
 statement text not null check(length(btrim(statement)) between 5 and 6000),
 difficulty smallint not null default 2 check(difficulty between 1 and 3),
 checklist jsonb not null check(private.valid_colle_checklist(checklist)),
 traps jsonb not null default '[]'::jsonb check(private.valid_colle_traps(traps)),
 status text not null default 'pending' check(status in ('approved','pending','rejected')),
 author_user_id uuid default auth.uid() references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default clock_timestamp()
);
create index colle_questions_pool on public.colle_questions(filiere,subject,chapter_key) where status='approved';
create index colle_questions_author on public.colle_questions(author_user_id,status);
create index colle_questions_pending on public.colle_questions(created_at) where status='pending';
alter table public.colle_questions enable row level security;
revoke all on public.colle_questions from anon,authenticated;
grant select on public.colle_questions to authenticated;
grant insert(filiere,subject,chapter,chapter_key,type,statement,difficulty,checklist,traps) on public.colle_questions to authenticated;
grant update(filiere,subject,chapter,chapter_key,type,statement,difficulty,checklist,traps,status) on public.colle_questions to authenticated;
create policy colle_questions_read on public.colle_questions for select to authenticated using (
 (status='approved' and (select public.prepago_has_access())) or author_user_id=(select auth.uid()) or (select public.cnc_is_admin()));
-- Students submit questions they had in colle; they wait for review.
create policy colle_questions_submit on public.colle_questions for insert to authenticated with check (
 author_user_id=(select auth.uid()) and status='pending' and (select public.prepago_has_access()));
create policy colle_questions_review on public.colle_questions for update to authenticated
 using((select public.cnc_is_admin())) with check((select public.cnc_is_admin()));
create trigger colle_questions_updated_at before update on public.colle_questions
 for each row execute function public.cnc_touch_updated_at();

create function private.limit_pending_submissions() returns trigger language plpgsql security definer
set search_path='' as $$
begin
 if new.author_user_id is not null and (select count(*) from public.colle_questions
   where author_user_id=new.author_user_id and status='pending')>=20 then
  raise exception 'Tu as déjà 20 questions en attente de validation.' using errcode='P0001';
 end if;
 return new;
end $$;
revoke all on function private.limit_pending_submissions() from public,anon,authenticated;
create trigger colle_questions_pending_limit before insert on public.colle_questions
 for each row execute function private.limit_pending_submissions();

-- Five accepted questions give one free month of the organisation plan, once per student.
create table private.colle_contributor_rewards (
 user_id uuid primary key references auth.users(id) on delete cascade,
 granted_at timestamptz not null default clock_timestamp(),
 previous_access jsonb,
 new_access jsonb
);
alter table private.colle_contributor_rewards enable row level security;
revoke all on private.colle_contributor_rewards from public,anon,authenticated;
create function private.colle_reward_contributor() returns trigger language plpgsql security definer
set search_path='' as $$
declare p public.profiles%rowtype; v_status text; v_plan text; v_end timestamptz;
begin
 if (select count(*) from public.colle_questions where author_user_id=new.author_user_id and status='approved')<5 then
  return null; end if;
 insert into private.colle_contributor_rewards(user_id) values(new.author_user_id) on conflict do nothing;
 if not found then return null; end if;
 select * into p from public.profiles where id=new.author_user_id for update;
 if not found then return null; end if;
 if p.subscription_status='active' and p.subscription_ends_at is null then
  -- Unlimited access already: nothing to extend.
  v_status=p.subscription_status; v_plan=p.subscription_plan; v_end=null;
 elsif p.subscription_status in ('active','promo') and p.subscription_ends_at>now() then
  v_status=p.subscription_status; v_plan=p.subscription_plan; v_end=p.subscription_ends_at+interval '30 days';
 elsif p.subscription_status='trial' and p.trial_ends_at>now() then
  v_status='promo'; v_plan='standard'; v_end=p.trial_ends_at+interval '30 days';
 else
  v_status='promo'; v_plan='standard'; v_end=now()+interval '30 days';
 end if;
 update public.profiles set subscription_status=v_status,subscription_plan=v_plan,subscription_ends_at=v_end where id=p.id;
 update private.colle_contributor_rewards set
  previous_access=jsonb_build_object('status',p.subscription_status,'plan',p.subscription_plan,'ends_at',p.subscription_ends_at),
  new_access=jsonb_build_object('status',v_status,'plan',v_plan,'ends_at',v_end)
 where user_id=p.id;
 return null;
end $$;
revoke all on function private.colle_reward_contributor() from public,anon,authenticated;
create trigger colle_questions_reward after update of status on public.colle_questions
 for each row when (new.status='approved' and old.status<>'approved' and new.author_user_id is not null)
 execute function private.colle_reward_contributor();

create function private.colle_contribution_core() returns jsonb language sql stable security definer
set search_path='' as $$
 select jsonb_build_object(
  'approved',(select count(*) from public.colle_questions where author_user_id=auth.uid() and status='approved'),
  'pending',(select count(*) from public.colle_questions where author_user_id=auth.uid() and status='pending'),
  'rejected',(select count(*) from public.colle_questions where author_user_id=auth.uid() and status='rejected'),
  'goal',5,
  'rewarded_at',(select granted_at from private.colle_contributor_rewards where user_id=auth.uid()));
$$;
create function public.colle_contribution() returns jsonb language sql security invoker
set search_path='' as $$ select private.colle_contribution_core(); $$;

-- ==== Colle attempts ======================================================================
create table public.colle_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 question_id uuid not null references public.colle_questions(id),
 mode text not null check(mode in ('solo','duo')),
 prep_seconds integer not null default 0 check(prep_seconds between 0 and 7200),
 pass_seconds integer not null default 0 check(pass_seconds between 0 and 7200),
 checked_items jsonb not null default '[]'::jsonb check(jsonb_typeof(checked_items)='array' and jsonb_array_length(checked_items)<=6),
 score numeric(4,2) not null check(score between 0 and 20),
 grading_method text not null default 'self' check(grading_method in ('self','ai')),
 ai_feedback jsonb,
 created_at timestamptz not null default now()
);
create index colle_attempts_user on public.colle_attempts(user_id,created_at desc);
create index colle_attempts_question on public.colle_attempts(question_id);
alter table public.colle_attempts enable row level security;
revoke all on public.colle_attempts from anon,authenticated;
grant select on public.colle_attempts to authenticated;
grant insert(question_id,mode,prep_seconds,pass_seconds,checked_items,score) on public.colle_attempts to authenticated;
create policy colle_attempts_read on public.colle_attempts for select to authenticated using(user_id=(select auth.uid()));
create policy colle_attempts_save on public.colle_attempts for insert to authenticated with check(
 user_id=(select auth.uid()) and mode='solo' and grading_method='self' and ai_feedback is null and (select public.prepago_has_access()));

-- Self-assessed score: ticked points over total points, out of 20. Same formula as gradeColle() in the app.
create function private.colle_self_score(question uuid,checked jsonb) returns numeric language sql stable security definer
set search_path='' as $$
 with items as (
  select e.ord-1 as idx,(e.value->'points')::numeric as pts
  from public.colle_questions q cross join lateral jsonb_array_elements(q.checklist) with ordinality e(value,ord)
  where q.id=question
 ), ticked as (
  select distinct x::integer as idx from jsonb_array_elements_text(case when jsonb_typeof(checked)='array' then checked else '[]'::jsonb end) x
  where x ~ '^[0-9]$'
 )
 select coalesce(round(sum(pts) filter (where idx in (select idx from ticked))/nullif(sum(pts),0)*20,2),0) from items;
$$;
revoke all on function private.colle_self_score(uuid,jsonb) from public,anon,authenticated;
create function private.colle_attempt_score() returns trigger language plpgsql security definer
set search_path='' as $$
begin
 if new.grading_method='self' then new.score=private.colle_self_score(new.question_id,new.checked_items); end if;
 return new;
end $$;
revoke all on function private.colle_attempt_score() from public,anon,authenticated;
create trigger colle_attempts_score before insert on public.colle_attempts
 for each row execute function private.colle_attempt_score();

-- ==== Duo colles: two phones, one 4-digit code ===============================================
create table public.colle_sessions (
 id uuid primary key default gen_random_uuid(),
 code text not null check(code ~ '^[0-9]{4}$'),
 host_id uuid not null references auth.users(id) on delete cascade,
 guest_id uuid references auth.users(id) on delete cascade,
 question_id uuid not null references public.colle_questions(id),
 prep_seconds integer not null check(prep_seconds between 0 and 3600),
 pass_seconds integer not null check(pass_seconds between 60 and 3600),
 phase text not null default 'waiting' check(phase in ('waiting','ready','prep','pass','review','done','cancelled')),
 phase_started_at timestamptz,
 checked_items jsonb not null default '[]'::jsonb check(jsonb_typeof(checked_items)='array' and jsonb_array_length(checked_items)<=6),
 score numeric(4,2) check(score between 0 and 20),
 attempt_id uuid references public.colle_attempts(id) on delete set null,
 closed boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default now()+interval '3 hours'
);
create unique index colle_sessions_open_code on public.colle_sessions(code) where not closed;
create index colle_sessions_host on public.colle_sessions(host_id) where not closed;
alter table public.colle_sessions enable row level security;
revoke all on public.colle_sessions from anon,authenticated;
grant select on public.colle_sessions to authenticated;
-- The colleur (host) drives the phases and ticks items; the end goes through colle_session_finish().
grant update(phase,checked_items,closed) on public.colle_sessions to authenticated;
create policy colle_sessions_read on public.colle_sessions for select to authenticated using(
 host_id=(select auth.uid()) or guest_id=(select auth.uid()));
create policy colle_sessions_drive on public.colle_sessions for update to authenticated
 using(host_id=(select auth.uid()) and not closed)
 with check(host_id=(select auth.uid()) and phase in ('waiting','ready','prep','pass','review','cancelled'));
create function private.colle_session_stamp() returns trigger language plpgsql security invoker
set search_path='' as $$
begin
 if new.phase is distinct from old.phase then new.phase_started_at=clock_timestamp(); end if;
 if new.phase='cancelled' then new.closed=true; end if;
 new.updated_at=clock_timestamp();
 return new;
end $$;
revoke all on function private.colle_session_stamp() from public,anon,authenticated;
create trigger colle_sessions_stamp before update on public.colle_sessions
 for each row execute function private.colle_session_stamp();

create table private.colle_join_limits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_started_at timestamptz not null,
 attempts integer not null
);
alter table private.colle_join_limits enable row level security;
revoke all on private.colle_join_limits from public,anon,authenticated;

-- Session as both phones see it, with the server clock so timers agree.
create function private.colle_session_json(s public.colle_sessions) returns jsonb language sql stable
set search_path='' as $$
 select to_jsonb(s)-'closed'||jsonb_build_object('closed',s.closed,'server_now',clock_timestamp(),
  'role',case when s.host_id=auth.uid() then 'colleur' else 'etudiant' end);
$$;
revoke all on function private.colle_session_json(public.colle_sessions) from public,anon,authenticated;

create function private.colle_session_create_core(question uuid,prep integer,pass integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); s public.colle_sessions%rowtype; i integer;
begin
 if v_user is null or not exists(select 1 from public.profiles p where p.id=v_user and (
  (p.subscription_status='active' and (p.subscription_ends_at is null or p.subscription_ends_at>now())) or
  (p.subscription_status='promo' and p.subscription_ends_at>now()) or
  (p.subscription_status='trial' and p.trial_ends_at>now()))) then
  raise exception 'Ton accès ne permet pas de créer une colle.' using errcode='42501'; end if;
 if not exists(select 1 from public.colle_questions where id=question and status='approved') then
  raise exception 'Cette question n’est pas dans la banque.' using errcode='22023'; end if;
 if prep is null or prep not between 0 and 3600 or pass is null or pass not between 60 and 3600 then
  raise exception 'Durées invalides.' using errcode='22023'; end if;
 update public.colle_sessions set closed=true where not closed and (expires_at<now() or host_id=v_user);
 for i in 1..60 loop
  begin
   insert into public.colle_sessions(code,host_id,question_id,prep_seconds,pass_seconds)
   values(lpad(floor(random()*10000)::integer::text,4,'0'),v_user,question,prep,pass) returning * into s;
   return private.colle_session_json(s);
  exception when unique_violation then null;
  end;
 end loop;
 raise exception 'Trop de colles en cours. Réessaie dans un instant.' using errcode='P0001';
end $$;

create function private.colle_session_join_core(join_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); s public.colle_sessions%rowtype; v_attempts integer;
begin
 if v_user is null or not exists(select 1 from public.profiles p where p.id=v_user and (
  (p.subscription_status='active' and (p.subscription_ends_at is null or p.subscription_ends_at>now())) or
  (p.subscription_status='promo' and p.subscription_ends_at>now()) or
  (p.subscription_status='trial' and p.trial_ends_at>now()))) then
  raise exception 'Ton accès ne permet pas de rejoindre une colle.' using errcode='42501'; end if;
 insert into private.colle_join_limits(user_id,window_started_at,attempts) values(v_user,now(),1)
 on conflict(user_id) do update set
  attempts=case when colle_join_limits.window_started_at<=now()-interval '10 minutes' then 1 else colle_join_limits.attempts+1 end,
  window_started_at=case when colle_join_limits.window_started_at<=now()-interval '10 minutes' then now() else colle_join_limits.window_started_at end
 returning attempts into v_attempts;
 if v_attempts>20 then raise exception 'Trop de tentatives. Réessaie dans 10 minutes.' using errcode='P0001'; end if;
 if join_code is null or btrim(join_code) !~ '^[0-9]{4}$' then
  raise exception 'Le code compte 4 chiffres : vérifie-le.' using errcode='22023'; end if;
 select * into s from public.colle_sessions where code=btrim(join_code) and not closed and expires_at>now() for update;
 if not found then raise exception 'Code introuvable ou expiré.' using errcode='P0002'; end if;
 if s.host_id=v_user then raise exception 'Tu es le colleur de cette colle : donne le code à ton camarade.' using errcode='22023'; end if;
 if s.guest_id is not null and s.guest_id<>v_user then raise exception 'Cette colle a déjà un étudiant.' using errcode='22023'; end if;
 update public.colle_sessions set guest_id=v_user,phase=case when phase='waiting' then 'ready' else phase end
 where id=s.id returning * into s;
 return private.colle_session_json(s);
end $$;

create function private.colle_session_state_core(session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.colle_sessions%rowtype;
begin
 select * into s from public.colle_sessions where id=session and (host_id=auth.uid() or guest_id=auth.uid());
 if not found then raise exception 'Cette colle n’existe plus.' using errcode='P0002'; end if;
 return private.colle_session_json(s);
end $$;

create function private.colle_session_finish_core(session uuid,prep_used integer,pass_used integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.colle_sessions%rowtype; v_attempt uuid; v_score numeric;
begin
 select * into s from public.colle_sessions where id=session and host_id=auth.uid() for update;
 if not found then raise exception 'Seul le colleur peut terminer la colle : demande-lui d’envoyer ta note.' using errcode='42501'; end if;
 if s.closed then raise exception 'Cette colle est déjà terminée.' using errcode='22023'; end if;
 if s.guest_id is null then raise exception 'Aucun étudiant n’a rejoint la colle.' using errcode='22023'; end if;
 v_score=private.colle_self_score(s.question_id,s.checked_items);
 insert into public.colle_attempts(user_id,question_id,mode,prep_seconds,pass_seconds,checked_items,score)
 values(s.guest_id,s.question_id,'duo',least(greatest(coalesce(prep_used,0),0),7200),least(greatest(coalesce(pass_used,0),0),7200),s.checked_items,v_score)
 returning id into v_attempt;
 update public.colle_sessions set phase='done',score=v_score,attempt_id=v_attempt,closed=true where id=s.id returning * into s;
 return private.colle_session_json(s);
end $$;

create function public.colle_session_create(question uuid,prep integer,pass integer) returns jsonb language sql security invoker
set search_path='' as $$ select private.colle_session_create_core(question,prep,pass); $$;
create function public.colle_session_join(join_code text) returns jsonb language sql security invoker
set search_path='' as $$ select private.colle_session_join_core(join_code); $$;
create function public.colle_session_state(session uuid) returns jsonb language sql security invoker
set search_path='' as $$ select private.colle_session_state_core(session); $$;
create function public.colle_session_finish(session uuid,prep_used integer,pass_used integer) returns jsonb language sql security invoker
set search_path='' as $$ select private.colle_session_finish_core(session,prep_used,pass_used); $$;

revoke all on function private.colle_contribution_core(),public.colle_contribution(),
 private.colle_session_create_core(uuid,integer,integer),public.colle_session_create(uuid,integer,integer),
 private.colle_session_join_core(text),public.colle_session_join(text),
 private.colle_session_state_core(uuid),public.colle_session_state(uuid),
 private.colle_session_finish_core(uuid,integer,integer),public.colle_session_finish(uuid,integer,integer)
 from public,anon,authenticated;
grant execute on function private.colle_contribution_core(),public.colle_contribution(),
 private.colle_session_create_core(uuid,integer,integer),public.colle_session_create(uuid,integer,integer),
 private.colle_session_join_core(text),public.colle_session_join(text),
 private.colle_session_state_core(uuid),public.colle_session_state(uuid),
 private.colle_session_finish_core(uuid,integer,integer),public.colle_session_finish(uuid,integer,integer)
 to authenticated;

-- ==== Mode Épreuve ========================================================================
alter table public.cnc_exams add column duration_minutes integer check(duration_minutes between 30 and 360);

create table public.exam_baremes (
 id uuid primary key default gen_random_uuid(),
 paper_id uuid not null references public.cnc_exams(id) on delete cascade,
 questions jsonb not null check(private.valid_bareme(questions)),
 status text not null default 'pending' check(status in ('approved','pending','rejected')),
 author_user_id uuid default auth.uid() references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default clock_timestamp()
);
create unique index exam_baremes_one_approved on public.exam_baremes(paper_id) where status='approved';
create index exam_baremes_author on public.exam_baremes(author_user_id,status);
create index exam_baremes_pending on public.exam_baremes(created_at) where status='pending';
alter table public.exam_baremes enable row level security;
revoke all on public.exam_baremes from anon,authenticated;
grant select on public.exam_baremes to authenticated;
grant insert(paper_id,questions) on public.exam_baremes to authenticated;
grant update(questions,status) on public.exam_baremes to authenticated;
create policy exam_baremes_read on public.exam_baremes for select to authenticated using(
 (status='approved' and (select public.prepago_has_access())) or author_user_id=(select auth.uid()) or (select public.cnc_is_admin()));
create policy exam_baremes_submit on public.exam_baremes for insert to authenticated with check(
 author_user_id=(select auth.uid()) and status='pending' and (select public.prepago_has_access()));
create policy exam_baremes_review on public.exam_baremes for update to authenticated
 using((select public.cnc_is_admin())) with check((select public.cnc_is_admin()));
create trigger exam_baremes_updated_at before update on public.exam_baremes
 for each row execute function public.cnc_touch_updated_at();
-- Approving a barème retires the one it replaces.
create function private.exam_bareme_replace() returns trigger language plpgsql security invoker
set search_path='' as $$
begin
 update public.exam_baremes set status='rejected' where paper_id=new.paper_id and status='approved' and id<>new.id;
 return new;
end $$;
revoke all on function private.exam_bareme_replace() from public,anon,authenticated;
create trigger exam_baremes_replace before update of status on public.exam_baremes
 for each row when (new.status='approved' and old.status<>'approved') execute function private.exam_bareme_replace();
create function private.limit_pending_baremes() returns trigger language plpgsql security definer
set search_path='' as $$
begin
 if new.author_user_id is not null and (select count(*) from public.exam_baremes
   where author_user_id=new.author_user_id and status='pending')>=20 then
  raise exception 'Tu as déjà 20 barèmes en attente de validation.' using errcode='P0001';
 end if;
 return new;
end $$;
revoke all on function private.limit_pending_baremes() from public,anon,authenticated;
create trigger exam_baremes_pending_limit before insert on public.exam_baremes
 for each row execute function private.limit_pending_baremes();

create table public.exam_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 paper_id uuid not null references public.cnc_exams(id),
 bareme_id uuid references public.exam_baremes(id) on delete set null,
 duration_seconds integer not null check(duration_seconds between 600 and 28800),
 used_seconds integer not null check(used_seconds between 0 and 86400),
 pauses integer not null default 0 check(pauses between 0 and 500),
 scores jsonb not null default '[]'::jsonb check(private.valid_exam_scores(scores)),
 total_20 numeric(4,2) check(total_20 between 0 and 20),
 copy_photos jsonb check(copy_photos is null or (jsonb_typeof(copy_photos)='array' and jsonb_array_length(copy_photos)<=12)),
 grading_method text not null default 'self' check(grading_method in ('self','ai')),
 ai_feedback jsonb,
 created_at timestamptz not null default now()
);
create index exam_attempts_user on public.exam_attempts(user_id,created_at desc);
alter table public.exam_attempts enable row level security;
revoke all on public.exam_attempts from anon,authenticated;
grant select on public.exam_attempts to authenticated;
grant insert(paper_id,bareme_id,duration_seconds,used_seconds,pauses,scores,total_20) on public.exam_attempts to authenticated;
grant update(copy_photos) on public.exam_attempts to authenticated;
create policy exam_attempts_read on public.exam_attempts for select to authenticated using(user_id=(select auth.uid()));
create policy exam_attempts_save on public.exam_attempts for insert to authenticated with check(
 user_id=(select auth.uid()) and grading_method='self' and ai_feedback is null and (select public.prepago_has_access()));
-- Photos of the copy are attached after saving, only from the student's own folder.
create policy exam_attempts_photos on public.exam_attempts for update to authenticated
 using(user_id=(select auth.uid()))
 with check(user_id=(select auth.uid()) and (copy_photos is null or not exists(
  select 1 from jsonb_array_elements(copy_photos) x where jsonb_typeof(x)<>'string' or x#>>'{}' not like (select auth.uid())::text||'/%')));
-- Total out of 20 from the points entered. Same formula as gradeExam() in the app.
create function private.exam_attempt_total() returns trigger language plpgsql security invoker
set search_path='' as $$
begin
 if new.grading_method='self' then
  new.total_20=(select case when sum((i->'max_points')::numeric)>0
   then round(sum((i->'points')::numeric)/sum((i->'max_points')::numeric)*20,2) end
   from jsonb_array_elements(new.scores) i);
 end if;
 return new;
end $$;
revoke all on function private.exam_attempt_total() from public,anon,authenticated;
create trigger exam_attempts_total before insert on public.exam_attempts
 for each row execute function private.exam_attempt_total();

-- Photos of a copy, kept for AI grading later. Path: <user id>/<attempt id>/<file id>.<ext>
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('exam-copies','exam-copies',false,8388608,array['image/jpeg','image/png','image/webp']);
create policy exam_copy_upload on storage.objects for insert to authenticated with check(
 bucket_id='exam-copies' and name ~ ('^'||(select auth.uid())::text||'/[a-f0-9-]{36}/[a-f0-9-]{36}[.](jpg|png|webp)$'));
create policy exam_copy_read on storage.objects for select to authenticated using(
 bucket_id='exam-copies' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy exam_copy_delete on storage.objects for delete to authenticated using(
 bucket_id='exam-copies' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- ==== Seed: 10 questions, Maths MPSI, Nombres complexes ======================================
insert into public.colle_questions(filiere,subject,chapter,chapter_key,type,statement,difficulty,checklist,traps,status,author_user_id) values
 ('MPSI','math','Nombres complexes','mp:sup:math:4e38fac7d8','cours',$q$Énoncer et démontrer la formule de Moivre : pour tout $\theta \in \mathbb{R}$ et tout $n \in \mathbb{Z}$, $(\cos\theta + i\sin\theta)^n = \cos(n\theta) + i\sin(n\theta)$.$q$,1,$q$[{"label": "Énoncé exact, avec le domaine de $n$ précisé", "points": 4}, {"label": "Démonstration par récurrence pour $n \\in \\mathbb{N}$", "points": 6}, {"label": "Extension aux entiers négatifs par passage à l'inverse", "points": 4}, {"label": "Lien avec l'écriture $e^{i\\theta}$ et la propriété $e^{ia}e^{ib}=e^{i(a+b)}$", "points": 3}, {"label": "Exemple d'application : $\\cos(3\\theta)$ en fonction de $\\cos\\theta$", "points": 3}]$q$::jsonb,$q$[{"question": "Pourquoi la formule ne s'étend-elle pas telle quelle à un exposant rationnel $n = 1/2$ ?", "answer": "Parce que $z \\mapsto z^{1/2}$ n'est pas défini de façon unique sur $\\mathbb{C}$ : un complexe non nul a deux racines carrées, l'égalité devient fausse en général."}, {"question": "Que vaut $(1+i)^{8}$ sans développer ?", "answer": "$1+i = \\sqrt{2}\\,e^{i\\pi/4}$, donc $(1+i)^8 = 16\\,e^{2i\\pi} = 16$."}]$q$::jsonb,'approved',null),
 ('MPSI','math','Nombres complexes','mp:sup:math:4e38fac7d8','cours',$q$Racines $n$-ièmes de l'unité : définition, expression explicite, nombre de racines et valeur de leur somme pour $n \geq 2$.$q$,2,$q$[{"label": "Définition : solutions de $z^n = 1$", "points": 3}, {"label": "Expression $\\omega_k = e^{2ik\\pi/n}$, $k \\in \\{0,\\dots,n-1\\}$, avec justification", "points": 6}, {"label": "Exactement $n$ racines distinctes, preuve de la distinction", "points": 4}, {"label": "Somme nulle pour $n \\geq 2$ via la somme géométrique", "points": 5}, {"label": "Interprétation : sommets d'un polygone régulier", "points": 2}]$q$::jsonb,$q$[{"question": "Que vaut le produit des racines $n$-ièmes de l'unité ?", "answer": "$(-1)^{n+1}$ : c'est $(-1)^n$ fois le coefficient constant $-1$ de $z^n - 1$."}, {"question": "Pourquoi faut-il $n \\geq 2$ pour que la somme soit nulle ?", "answer": "Pour $n = 1$ la seule racine est $1$, la somme vaut $1$ ; la formule géométrique demande $\\omega \\neq 1$."}]$q$::jsonb,'approved',null),
 ('MPSI','math','Nombres complexes','mp:sup:math:4e38fac7d8','exercice',$q$Résoudre dans $\mathbb{C}$ l'équation $z^2 - (3+2i)z + 5 + 5i = 0$.$q$,2,$q$[{"label": "Calcul correct du discriminant $\\Delta = -15 - 8i$", "points": 5}, {"label": "Recherche d'une racine carrée $\\delta = a+ib$ avec le système $a^2-b^2$, $2ab$ et le module", "points": 6}, {"label": "$\\delta = 1 - 4i$ (ou son opposé)", "points": 3}, {"label": "Solutions $z_1 = 2 - i$ et $z_2 = 1 + 3i$", "points": 4}, {"label": "Vérification par la somme et le produit des racines", "points": 2}]$q$::jsonb,$q$[{"question": "Pourquoi utiliser $|\\delta|^2 = |\\Delta|$ dans le système ?", "answer": "Cela donne $a^2+b^2 = 17$, qui combiné à $a^2-b^2 = -15$ fixe $a^2$ et $b^2$ sans résoudre d'équation du quatrième degré."}, {"question": "Comment vérifier rapidement le résultat ?", "answer": "$z_1 + z_2 = 3 + 2i$ et $z_1 z_2 = 5 + 5i$, ce sont les relations coefficients-racines."}]$q$::jsonb,'approved',null),
 ('MPSI','math','Nombres complexes','mp:sup:math:4e38fac7d8','exercice',$q$Déterminer l'ensemble des points $M$ d'affixe $z$ tels que $|z - i| = |z + 1|$.$q$,1,$q$[{"label": "Interprétation : $M$ équidistant des points d'affixes $i$ et $-1$", "points": 6}, {"label": "Conclusion : médiatrice du segment joignant ces deux points", "points": 5}, {"label": "Équation cartésienne $y = -x$ obtenue en posant $z = x + iy$", "points": 6}, {"label": "Figure ou vérification sur un point particulier", "points": 3}]$q$::jsonb,$q$[{"question": "Et l'ensemble des $z$ tels que $|z - i| = 2|z + 1|$ ?", "answer": "Ce n'est plus une droite mais un cercle (cercle d'Apollonius), car le rapport des distances est différent de $1$."}, {"question": "L'ensemble contient-il l'origine ?", "answer": "Oui : $|0 - i| = 1 = |0 + 1|$, et $O$ vérifie bien $y = -x$."}]$q$::jsonb,'approved',null),
 ('MPSI','math','Nombres complexes','mp:sup:math:4e38fac7d8','exercice',$q$Pour $n \in \mathbb{N}$ et $\theta \in \mathbb{R}$, calculer $S_n = \displaystyle\sum_{k=0}^{n} \binom{n}{k} \cos(k\theta)$.$q$,3,$q$[{"label": "Idée : $S_n = \\mathrm{Re}\\left(\\sum \\binom{n}{k} e^{ik\\theta}\\right)$", "points": 5}, {"label": "Formule du binôme : $(1 + e^{i\\theta})^n$", "points": 4}, {"label": "Factorisation par l'angle moitié : $1 + e^{i\\theta} = 2\\cos(\\theta/2)\\,e^{i\\theta/2}$", "points": 6}, {"label": "Résultat $S_n = 2^n \\cos^n(\\theta/2) \\cos(n\\theta/2)$", "points": 5}]$q$::jsonb,$q$[{"question": "Que vaut $\\sum \\binom{n}{k} \\sin(k\\theta)$ ?", "answer": "La partie imaginaire du même calcul : $2^n \\cos^n(\\theta/2)\\sin(n\\theta/2)$."}, {"question": "Que se passe-t-il pour $\\theta = \\pi$ ?", "answer": "$\\cos(\\pi/2) = 0$ donc $S_n = 0$ pour $n \\geq 1$, ce qui correspond à $\\sum \\binom{n}{k}(-1)^k = 0$."}]$q$::jsonb,'approved',null),
 ('MPSI','math','Nombres complexes','mp:sup:math:4e38fac7d8','exercice',$q$Montrer que pour tous $z, z' \in \mathbb{C}$, $|z + z'|^2 + |z - z'|^2 = 2\left(|z|^2 + |z'|^2\right)$, puis interpréter géométriquement.$q$,1,$q$[{"label": "Utilisation de $|w|^2 = w\\overline{w}$", "points": 5}, {"label": "Développement correct des deux termes", "points": 6}, {"label": "Simplification des termes croisés $z\\overline{z'} + \\overline{z}z'$", "points": 5}, {"label": "Interprétation : identité du parallélogramme", "points": 4}]$q$::jsonb,$q$[{"question": "Quel cas d'égalité donne $|z + z'| = |z| + |z'|$ ?", "answer": "Lorsque $z$ et $z'$ ont le même argument (ou que l'un est nul) : ils sont positivement colinéaires."}, {"question": "Que représente $z\\overline{z'} + \\overline{z}z'$ ?", "answer": "$2\\,\\mathrm{Re}(z\\overline{z'})$, c'est-à-dire deux fois le produit scalaire des vecteurs associés."}]$q$::jsonb,'approved',null),
 ('MPSI','math','Nombres complexes','mp:sup:math:4e38fac7d8','exercice',$q$Linéariser $\cos^3\theta$, puis en déduire une primitive de $\theta \mapsto \cos^3\theta$.$q$,1,$q$[{"label": "Formule d'Euler $\\cos\\theta = \\frac{e^{i\\theta} + e^{-i\\theta}}{2}$", "points": 5}, {"label": "Développement par le binôme", "points": 5}, {"label": "$\\cos^3\\theta = \\frac{1}{4}\\cos(3\\theta) + \\frac{3}{4}\\cos\\theta$", "points": 6}, {"label": "Primitive $\\frac{1}{12}\\sin(3\\theta) + \\frac{3}{4}\\sin\\theta$", "points": 4}]$q$::jsonb,$q$[{"question": "Comment linéariser $\\sin^3\\theta$ ?", "answer": "$\\sin^3\\theta = \\frac{3}{4}\\sin\\theta - \\frac{1}{4}\\sin(3\\theta)$, avec $\\sin\\theta = \\frac{e^{i\\theta} - e^{-i\\theta}}{2i}$."}, {"question": "Quelle autre méthode pour la primitive ?", "answer": "Écrire $\\cos^3\\theta = \\cos\\theta(1 - \\sin^2\\theta)$ et poser $u = \\sin\\theta$."}]$q$::jsonb,'approved',null),
 ('MPSI','math','Nombres complexes','mp:sup:math:4e38fac7d8','cours',$q$Forme exponentielle d'un complexe non nul : définition de l'argument, et démonstration de $\arg(zz') \equiv \arg z + \arg z' \ [2\pi]$.$q$,2,$q$[{"label": "Existence de l'écriture $z = |z|e^{i\\theta}$ pour $z \\neq 0$", "points": 4}, {"label": "Argument défini modulo $2\\pi$, non défini pour $z = 0$", "points": 4}, {"label": "Preuve via $e^{ia}e^{ib} = e^{i(a+b)}$", "points": 6}, {"label": "Conséquences pour $\\arg(1/z)$ et $\\arg(z/z')$", "points": 4}, {"label": "Exemple : argument de $(1+i)(\\sqrt{3}+i)$", "points": 2}]$q$::jsonb,$q$[{"question": "Pourquoi parle-t-on de congruence et non d'égalité ?", "answer": "L'argument n'est défini qu'à $2\\pi$ près : la somme des arguments principaux peut sortir de $]-\\pi, \\pi]$."}, {"question": "Que vaut $\\arg(\\overline{z})$ ?", "answer": "$-\\arg z \\ [2\\pi]$, car $\\overline{z} = |z|e^{-i\\theta}$."}]$q$::jsonb,'approved',null),
 ('MPSI','math','Nombres complexes','mp:sup:math:4e38fac7d8','exercice',$q$Soit $n \geq 2$. Calculer le produit $P = \displaystyle\prod_{k=1}^{n-1} \left(1 - e^{2ik\pi/n}\right)$.$q$,2,$q$[{"label": "Factorisation $z^n - 1 = \\prod_{k=0}^{n-1}(z - \\omega_k)$", "points": 6}, {"label": "Division par $z - 1$ : $1 + z + \\dots + z^{n-1} = \\prod_{k=1}^{n-1}(z - \\omega_k)$", "points": 6}, {"label": "Évaluation en $z = 1$", "points": 4}, {"label": "Résultat $P = n$", "points": 4}]$q$::jsonb,$q$[{"question": "En déduire $\\prod_{k=1}^{n-1} \\sin(k\\pi/n)$.", "answer": "$|1 - e^{2ik\\pi/n}| = 2\\sin(k\\pi/n)$, donc le produit vaut $n / 2^{n-1}$."}, {"question": "Pourquoi la factorisation de $z^n - 1$ est-elle légitime ?", "answer": "C'est un polynôme unitaire de degré $n$ qui admet $n$ racines distinctes, les racines $n$-ièmes de l'unité."}]$q$::jsonb,'approved',null),
 ('MPSI','math','Nombres complexes','mp:sup:math:4e38fac7d8','exercice',$q$Soit $u = e^{2i\pi/5}$. Calculer $1 + u + u^2 + u^3 + u^4$, puis en déduire la valeur exacte de $\cos\left(\frac{2\pi}{5}\right)$.$q$,3,$q$[{"label": "Somme nulle par la somme géométrique, avec $u^5 = 1$ et $u \\neq 1$", "points": 4}, {"label": "Poser $a = u + u^4 = 2\\cos(2\\pi/5)$ et $b = u^2 + u^3$", "points": 5}, {"label": "Montrer $a + b = -1$ et $ab = -1$", "points": 5}, {"label": "$a$ et $b$ racines de $X^2 + X - 1$, choix de la racine positive", "points": 3}, {"label": "$\\cos(2\\pi/5) = \\frac{\\sqrt{5} - 1}{4}$", "points": 3}]$q$::jsonb,$q$[{"question": "Pourquoi $a$ est-il la racine positive ?", "answer": "$2\\pi/5 \\in ]0, \\pi/2[$ donc $\\cos(2\\pi/5) > 0$, alors que $b = 2\\cos(4\\pi/5) < 0$."}, {"question": "Quelle figure géométrique est liée à ce calcul ?", "answer": "Le pentagone régulier : c'est ce qui permet sa construction à la règle et au compas."}]$q$::jsonb,'approved',null);
