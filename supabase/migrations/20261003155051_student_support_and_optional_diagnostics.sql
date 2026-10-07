-- Student reports are private to their author and server-verified administrators.
create table public.support_reports (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('problem','content','idea','privacy','technical')),
 page text not null check(length(page) between 1 and 30),
 title text not null check(length(title) between 3 and 100),
 details text not null check(length(details) between 10 and 2000),
 context jsonb not null default '{}'::jsonb,
 status text not null default 'open' check(status in ('open','in_progress','resolved')),
 reply text not null default '' check(length(reply)<=1500),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create index support_reports_user_created on public.support_reports(user_id,created_at desc);
create index support_reports_status_created on public.support_reports(status,created_at desc);
alter table public.support_reports enable row level security;
revoke all on public.support_reports from public,anon,authenticated;
grant select on public.support_reports to authenticated;
create policy support_reports_read on public.support_reports for select to authenticated
 using(user_id=(select auth.uid()) or (select public.cnc_is_admin()));

create function private.submit_support_report_core(input_kind text,input_page text,input_title text,input_details text,input_context jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result uuid; safe_context jsonb:='{}'::jsonb;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if input_kind not in ('problem','content','idea','privacy') or input_kind is null
  or input_page not in ('overview','dashboard','subjects','cnc','tasks','projects','calendar','focus','progress','ai','account','access','connexion') or input_page is null
  or length(btrim(input_title)) not between 3 and 100 or input_title is null
  or length(btrim(input_details)) not between 10 and 2000 or input_details is null then
  raise exception 'Invalid report' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,191));
 if (select count(*) from public.support_reports where user_id=uid and kind<>'technical' and created_at>now()-interval '24 hours')>=8 then
  raise exception 'Report limit reached' using errcode='P0001'; end if;
 if jsonb_typeof(input_context)='object' then
  if input_context->>'filiere' in ('MP','PSI','TSI','ECS','ECT') then safe_context:=safe_context||jsonb_build_object('filiere',input_context->>'filiere');end if;
  if input_context->>'year' ~ '^[0-9]{4}$' and (input_context->>'year')::integer between 1990 and 2100 then safe_context:=safe_context||jsonb_build_object('year',(input_context->>'year')::integer);end if;
  if input_context ? 'subject' then safe_context:=safe_context||jsonb_build_object('subject',left(input_context->>'subject',100));end if;
 end if;
 insert into public.support_reports(user_id,kind,page,title,details,context)
 values(uid,input_kind,input_page,btrim(input_title),btrim(input_details),safe_context) returning id into result;
 return result;
end $$;

create function private.record_workspace_fault_core(input_code text,input_page text)
returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 if input_code not in ('runtime_error','unhandled_rejection','cloud_sync_failure','sync_conflict','invalid_local_draft','ai_request_failed') or input_code is null
  or input_page not in ('overview','dashboard','subjects','cnc','tasks','projects','calendar','focus','progress','ai','account','access','connexion') or input_page is null then
  raise exception 'Invalid diagnostic' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,191));
 if exists(select 1 from public.support_reports where user_id=uid and kind='technical' and title=input_code and created_at>now()-interval '15 minutes')
  or (select count(*) from public.support_reports where user_id=uid and kind='technical' and created_at>now()-interval '24 hours')>=5 then return false;end if;
 insert into public.support_reports(user_id,kind,page,title,details)
 values(uid,'technical',input_page,input_code,'Diagnostic technique partagé volontairement ; aucun texte saisi ni contenu de travail.');
 return true;
end $$;

create function private.admin_reply_report_core(report_id uuid,new_status text,new_reply text,expected_updated_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin') then raise exception 'Administrator required' using errcode='42501';end if;
 if new_status not in ('open','in_progress','resolved') or new_status is null or new_reply is null or length(new_reply)>1500 then raise exception 'Invalid reply' using errcode='22023';end if;
 update public.support_reports set status=new_status,reply=btrim(new_reply),updated_at=clock_timestamp()
 where id=report_id and updated_at=expected_updated_at;
 return found;
end $$;

create function public.submit_support_report(input_kind text,input_page text,input_title text,input_details text,input_context jsonb default '{}'::jsonb)
returns uuid language sql security invoker set search_path='' as $$ select private.submit_support_report_core(input_kind,input_page,input_title,input_details,input_context); $$;
create function public.record_workspace_fault(input_code text,input_page text)
returns boolean language sql security invoker set search_path='' as $$ select private.record_workspace_fault_core(input_code,input_page); $$;
create function public.admin_reply_report(report_id uuid,new_status text,new_reply text,expected_updated_at timestamptz)
returns boolean language sql security invoker set search_path='' as $$ select private.admin_reply_report_core(report_id,new_status,new_reply,expected_updated_at); $$;
revoke all on function private.submit_support_report_core(text,text,text,text,jsonb),private.record_workspace_fault_core(text,text),private.admin_reply_report_core(uuid,text,text,timestamptz),public.submit_support_report(text,text,text,text,jsonb),public.record_workspace_fault(text,text),public.admin_reply_report(uuid,text,text,timestamptz) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.submit_support_report_core(text,text,text,text,jsonb),private.record_workspace_fault_core(text,text),private.admin_reply_report_core(uuid,text,text,timestamptz),public.submit_support_report(text,text,text,text,jsonb),public.record_workspace_fault(text,text),public.admin_reply_report(uuid,text,text,timestamptz) to authenticated;
