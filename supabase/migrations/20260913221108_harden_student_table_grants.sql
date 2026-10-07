revoke all privileges on table public.profiles from anon;
revoke all privileges on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, filiere) on table public.profiles to authenticated;

revoke all privileges on table public.user_roles from anon;
revoke all privileges on table public.user_roles from authenticated;
grant select on table public.user_roles to authenticated;
