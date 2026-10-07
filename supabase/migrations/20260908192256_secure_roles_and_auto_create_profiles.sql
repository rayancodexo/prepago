-- Separate authorization data from editable profile data
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

-- Users may only read their own role. They cannot insert/update/delete roles.
create policy "Users can view own role"
on public.user_roles
for select
to authenticated
using ((select auth.uid()) = user_id);

grant select on public.user_roles to authenticated;
revoke insert, update, delete on public.user_roles from authenticated;

-- The role column should not live in the student-editable profiles table.
alter table public.profiles drop column if exists role;

-- Students may edit only normal profile fields, not XP or account identifiers.
revoke update on public.profiles from authenticated;
grant update (full_name, filiere) on public.profiles to authenticated;

-- Automatically create profile + protected student role after Auth signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, filiere)
  values (
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    case
      when new.raw_user_meta_data ->> 'filiere' in ('MP','PSI','ECS','EST')
        then new.raw_user_meta_data ->> 'filiere'
      else null
    end
  );

  insert into public.user_roles (user_id, role)
  values (new.id, 'student');

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
