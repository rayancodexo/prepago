-- Server-side entitlement and billing guards. Exercise text is never stored here.
create table private.ai_requests (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 state text not null default 'reserved' check(state in ('reserved','completed','failed')),
 input_tokens integer not null default 0 check(input_tokens between 0 and 100000),
 output_tokens integer not null default 0 check(output_tokens between 0 and 800)
);
create index ai_requests_user_created on private.ai_requests(user_id,created_at desc);
create index ai_requests_created on private.ai_requests(created_at);
alter table private.ai_requests enable row level security;
revoke all on private.ai_requests from public,anon,authenticated;

create function private.ai_entitlement_core(target_user uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.user_roles where user_id=target_user and role='admin')
 or exists(select 1 from public.profiles where id=target_user and subscription_plan='ai_plus' and (
  (subscription_status='active' and (subscription_ends_at is null or subscription_ends_at>now()))
  or (subscription_status='promo' and subscription_ends_at>now())
  or (subscription_status='trial' and trial_ends_at>now())));
$$;
revoke all on function private.ai_entitlement_core(uuid) from public,anon,authenticated;

create function private.ai_tutor_status_core() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); midnight timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 return jsonb_build_object('allowed',private.ai_entitlement_core(uid),
  'used_today',(select count(*) from private.ai_requests where user_id=uid and created_at>=midnight),
  'daily_limit',10,'resets_at',midnight+interval '1 day',
  'filiere',(select filiere from public.profiles where id=uid));
end $$;
create function public.ai_tutor_status() returns jsonb language sql security invoker set search_path=''
 as $$ select private.ai_tutor_status_core(); $$;
revoke all on function private.ai_tutor_status_core(),public.ai_tutor_status() from public,anon,authenticated;
grant execute on function private.ai_tutor_status_core(),public.ai_tutor_status() to authenticated;

create function private.reserve_ai_request_core(target_user uuid,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare midnight timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'; used integer;
begin
 if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
 then raise exception 'Server required' using errcode='42501';end if;
 if not private.ai_entitlement_core(target_user) then return jsonb_build_object('ok',false,'code','subscription_required');end if;
 -- Serialize reservations across users so parallel calls cannot exceed the global cap.
 perform pg_advisory_xact_lock(819724001);
 if exists(select 1 from private.ai_requests where id=request_id) then return jsonb_build_object('ok',false,'code','duplicate_request');end if;
 select count(*) into used from private.ai_requests where user_id=target_user and created_at>=midnight;
 if used>=10 then return jsonb_build_object('ok',false,'code','daily_limit');end if;
 if (select count(*) from private.ai_requests where created_at>=midnight)>=100 then return jsonb_build_object('ok',false,'code','service_limit');end if;
 if exists(select 1 from private.ai_requests where user_id=target_user and created_at>clock_timestamp()-interval '20 seconds') then
  return jsonb_build_object('ok',false,'code','rate_limit');end if;
 insert into private.ai_requests(id,user_id)values(request_id,target_user);
 return jsonb_build_object('ok',true,'used_today',used+1,'daily_limit',10,'resets_at',midnight+interval '1 day');
end $$;
create function private.finish_ai_request_core(request_id uuid,new_state text,used_input integer,used_output integer) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
 then raise exception 'Server required' using errcode='42501';end if;
 if new_state not in ('completed','failed') or new_state is null or used_input is null or used_output is null
  or used_input not between 0 and 100000 or used_output not between 0 and 800 then raise exception 'Invalid usage' using errcode='22023';end if;
 update private.ai_requests set state=new_state,input_tokens=used_input,output_tokens=used_output where id=request_id and state='reserved';
 return found;
end $$;
create function public.reserve_ai_request(target_user uuid,request_id uuid) returns jsonb language sql security invoker set search_path=''
 as $$ select private.reserve_ai_request_core(target_user,request_id); $$;
create function public.finish_ai_request(request_id uuid,new_state text,used_input integer,used_output integer) returns boolean
language sql security invoker set search_path='' as $$ select private.finish_ai_request_core(request_id,new_state,used_input,used_output); $$;
revoke all on function private.reserve_ai_request_core(uuid,uuid),private.finish_ai_request_core(uuid,text,integer,integer),
 public.reserve_ai_request(uuid,uuid),public.finish_ai_request(uuid,text,integer,integer) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.reserve_ai_request_core(uuid,uuid),private.finish_ai_request_core(uuid,text,integer,integer),
 public.reserve_ai_request(uuid,uuid),public.finish_ai_request(uuid,text,integer,integer) to service_role;
