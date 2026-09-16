-- Optimistic concurrency: a stale device must not overwrite a newer saved workspace.
create or replace function public.save_student_state(next_data jsonb, expected_updated_at timestamptz)
returns table(saved boolean, server_updated_at timestamptz)
language plpgsql security invoker set search_path='' as $$
declare v_updated timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(next_data) <> 'object' then raise exception 'Invalid workspace'; end if;
  if expected_updated_at is null then
    insert into public.student_app_state(user_id,data,updated_at)
    values(auth.uid(),next_data,clock_timestamp()) on conflict(user_id) do nothing
    returning updated_at into v_updated;
  else
    update public.student_app_state set data=next_data,updated_at=clock_timestamp()
    where user_id=auth.uid() and updated_at=expected_updated_at returning updated_at into v_updated;
  end if;
  return query select v_updated is not null,v_updated;
end;
$$;
revoke execute on function public.save_student_state(jsonb,timestamptz) from public,anon;
grant execute on function public.save_student_state(jsonb,timestamptz) to authenticated;
