-- AI tutor v2
-- 1. Longer answers for explanations and corrections (output cap 800 -> 4000 tokens).
-- 2. A request that failed on the provider side no longer counts against the daily quota.

alter table private.ai_requests drop constraint if exists ai_requests_output_tokens_check;
alter table private.ai_requests add constraint ai_requests_output_tokens_check check(output_tokens between 0 and 4000);

create or replace function private.ai_tutor_status_core() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); midnight timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 return jsonb_build_object('allowed',private.ai_entitlement_core(uid),
  'used_today',(select count(*) from private.ai_requests where user_id=uid and created_at>=midnight and state<>'failed'),
  'daily_limit',10,'resets_at',midnight+interval '1 day',
  'filiere',(select filiere from public.profiles where id=uid));
end $$;

create or replace function private.reserve_ai_request_core(target_user uuid,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare midnight timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'; used integer;
begin
 if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
 then raise exception 'Server required' using errcode='42501';end if;
 if not private.ai_entitlement_core(target_user) then return jsonb_build_object('ok',false,'code','subscription_required');end if;
 perform pg_advisory_xact_lock(819724001);
 if exists(select 1 from private.ai_requests where id=request_id) then return jsonb_build_object('ok',false,'code','duplicate_request');end if;
 select count(*) into used from private.ai_requests where user_id=target_user and created_at>=midnight and state<>'failed';
 if used>=10 then return jsonb_build_object('ok',false,'code','daily_limit');end if;
 if (select count(*) from private.ai_requests where created_at>=midnight and state<>'failed')>=100 then return jsonb_build_object('ok',false,'code','service_limit');end if;
 -- Failed requests still count for the 20-second spacing, so retries cannot hammer the provider.
 if exists(select 1 from private.ai_requests where user_id=target_user and created_at>clock_timestamp()-interval '20 seconds') then
  return jsonb_build_object('ok',false,'code','rate_limit');end if;
 insert into private.ai_requests(id,user_id)values(request_id,target_user);
 return jsonb_build_object('ok',true,'used_today',used+1,'daily_limit',10,'resets_at',midnight+interval '1 day');
end $$;

create or replace function private.finish_ai_request_core(request_id uuid,new_state text,used_input integer,used_output integer) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
 then raise exception 'Server required' using errcode='42501';end if;
 if new_state not in ('completed','failed') or new_state is null or used_input is null or used_output is null
  or used_input not between 0 and 100000 or used_output not between 0 and 4000 then raise exception 'Invalid usage' using errcode='22023';end if;
 update private.ai_requests set state=new_state,input_tokens=used_input,output_tokens=used_output where id=request_id and state='reserved';
 return found;
end $$;
