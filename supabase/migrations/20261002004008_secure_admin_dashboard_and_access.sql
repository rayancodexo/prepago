create table private.admin_access_audit (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null, target_id uuid not null,
 previous_access jsonb not null, new_access jsonb not null,
 reason text not null check(length(reason) between 3 and 250),
 created_at timestamptz not null default clock_timestamp()
);
alter table private.admin_access_audit enable row level security;
revoke all on private.admin_access_audit from public,anon,authenticated;

create function private.admin_dashboard_core() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin') then
  raise exception 'Administrateur requis.' using errcode='42501'; end if;
 return jsonb_build_object(
 'accounts',coalesce((select jsonb_agg(to_jsonb(a)) from (
  select p.id,p.email,p.full_name,p.filiere,p.created_at,p.subscription_status,
   p.subscription_plan,p.subscription_ends_at,p.trial_ends_at,r.role,
   u.email_confirmed_at is not null as email_verified,u.last_sign_in_at
  from public.profiles p join public.user_roles r on r.user_id=p.id
  join auth.users u on u.id=p.id order by p.created_at desc limit 1000
 ) a),'[]'::jsonb),
 'activity',coalesce((select jsonb_agg(to_jsonb(a)) from (
  select h.id,h.target_id,p.full_name,h.previous_access,h.new_access,h.reason,h.created_at
  from private.admin_access_audit h left join public.profiles p on p.id=h.target_id
  order by h.created_at desc limit 50
 ) a),'[]'::jsonb));
end $$;

create function private.admin_set_student_access_core(target_user uuid,new_status text,
 new_plan text,access_days integer,change_reason text,expected_access jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype; before_value jsonb; after_value jsonb; v_end timestamptz;
begin
 if auth.uid() is null or not exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin') then
  raise exception 'Administrateur requis.' using errcode='42501';end if;
 if new_status is null or new_status not in ('active','inactive','expired','cancelled') or
    new_plan is null or new_plan not in ('standard','ai_plus') or
    change_reason is null or length(btrim(change_reason)) not between 3 and 250 or
    (new_status='active' and (access_days is null or access_days not between 1 and 3650)) then
  raise exception 'Vérifiez le statut, la durée et le motif.' using errcode='22023';end if;
 select * into p from public.profiles where id=target_user for update;
 if not found or exists(select 1 from public.user_roles where user_id=target_user and role='admin') then
  raise exception 'Choisissez un compte étudiant.' using errcode='22023';end if;
 before_value=jsonb_build_object('status',p.subscription_status,'plan',p.subscription_plan,'ends_at',p.subscription_ends_at);
 if expected_access is distinct from before_value then
  raise exception 'Ce compte a changé. Actualisez avant de réessayer.' using errcode='40001';end if;
 v_end=case when new_status='active' then greatest(now(),p.subscription_ends_at)+make_interval(days=>access_days) else p.subscription_ends_at end;
 update public.profiles set subscription_status=new_status,subscription_plan=new_plan,subscription_ends_at=v_end where id=target_user;
 after_value=jsonb_build_object('status',new_status,'plan',new_plan,'ends_at',v_end);
 insert into private.admin_access_audit(actor_id,target_id,previous_access,new_access,reason)
 values(auth.uid(),target_user,before_value,after_value,btrim(change_reason));
 return after_value;
end $$;

create function public.admin_dashboard() returns jsonb language sql security invoker
set search_path='' as $$ select private.admin_dashboard_core(); $$;
create function public.admin_set_student_access(target_user uuid,new_status text,new_plan text,
 access_days integer,change_reason text,expected_access jsonb) returns jsonb
language sql security invoker set search_path='' as $$
 select private.admin_set_student_access_core(target_user,new_status,new_plan,access_days,change_reason,expected_access); $$;
revoke all on function private.admin_dashboard_core(),public.admin_dashboard(),
 private.admin_set_student_access_core(uuid,text,text,integer,text,jsonb),
 public.admin_set_student_access(uuid,text,text,integer,text,jsonb) from public,anon,authenticated;
grant execute on function private.admin_dashboard_core(),public.admin_dashboard(),
 private.admin_set_student_access_core(uuid,text,text,integer,text,jsonb),
 public.admin_set_student_access(uuid,text,text,integer,text,jsonb) to authenticated;
