-- Students can say which prépa (CPGE centre) they are in: picked from a list or typed.
alter table public.profiles add column if not exists prepa text;
alter table public.profiles drop constraint if exists profiles_prepa_check;
alter table public.profiles add constraint profiles_prepa_check
  check (prepa is null or (char_length(prepa) between 1 and 120));

-- Students may edit their own name, filière and prépa, nothing else.
revoke update on public.profiles from authenticated;
grant update(full_name, filiere, prepa) on public.profiles to authenticated;

-- Sign-up keeps the prépa sent in the account metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
declare selected_track text; selected_prepa text;
begin
 selected_track:=upper(trim(new.raw_user_meta_data->>'filiere'));
 selected_track:=case selected_track when 'MPSI' then 'MP' when 'PCSI' then 'PSI' else selected_track end;
 selected_prepa:=left(nullif(regexp_replace(trim(coalesce(new.raw_user_meta_data->>'prepa','')),'\s+',' ','g'),''),120);
 insert into public.profiles(id,email,full_name,filiere,prepa)
 values(new.id,new.email,nullif(trim(new.raw_user_meta_data->>'full_name'),''),
  case when selected_track in ('MP','PSI','TSI','ECS','ECT','EST') then selected_track else null end,
  selected_prepa);
 insert into public.user_roles(user_id,role) values(new.id,'student');
 return new;
end;
$$;
revoke execute on function public.handle_new_user() from public,anon,authenticated;
