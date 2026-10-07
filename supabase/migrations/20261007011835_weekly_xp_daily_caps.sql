-- Workspace XP comes from JSON the browser saves, so it must be bounded server-side.
-- Per student and per day (Africa/Casablanca): at most 600 XP from workspace activity,
-- of which at most 200 XP from tasks. Anything beyond is recorded with 0 XP so it can
-- never be claimed later. Focus XP is unaffected: the server already times it.
create or replace function private.track_workspace_weekly_xp()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
 day_start timestamptz:=date_trunc('day',clock_timestamp() at time zone 'Africa/Casablanca') at time zone 'Africa/Casablanca';
 used integer; task_used integer;
begin
 -- First import of a workspace never turns historical completions into new XP.
 if tg_op='INSERT' then
  insert into private.weekly_xp_awards(user_id,award_key,amount,baseline)
  select new.user_id,a.award_key,a.amount,true from private.workspace_xp_items(new.data) a on conflict do nothing;
  return new;
 end if;
 select coalesce(sum(amount),0),coalesce(sum(amount) filter(where award_key like 'task:%'),0) into used,task_used
 from private.weekly_xp_awards
 where user_id=new.user_id and not baseline and award_key not like 'focus:%' and earned_at>=day_start;
 insert into private.weekly_xp_awards(user_id,award_key,amount,baseline)
 select new.user_id,n.award_key,
  case when used+n.running>600 or (n.is_task and task_used+n.task_running>200) then 0 else n.amount end,false
 from (
  select a.award_key,a.amount,a.award_key like 'task:%' as is_task,
   sum(a.amount) over(order by a.award_key) as running,
   coalesce(sum(a.amount) filter(where a.award_key like 'task:%') over(order by a.award_key),0) as task_running
  from private.workspace_xp_items(new.data) a
  where not exists(select 1 from private.weekly_xp_awards w where w.user_id=new.user_id and w.award_key=a.award_key)
 ) n
 on conflict do nothing;
 return new;
end $function$;
