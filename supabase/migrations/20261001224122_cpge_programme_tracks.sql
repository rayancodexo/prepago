-- Applied as cpge_programme_tracks. Retain EST solely for legacy profiles.
alter table public.profiles drop constraint profiles_filiere_check;
alter table public.profiles add constraint profiles_filiere_check
 check(filiere in ('MP','PSI','TSI','ECS','ECT','EST'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
declare selected_track text;
begin
 selected_track:=upper(trim(new.raw_user_meta_data->>'filiere'));
 selected_track:=case selected_track when 'MPSI' then 'MP' when 'PCSI' then 'PSI' else selected_track end;
 insert into public.profiles(id,email,full_name,filiere)
 values(new.id,new.email,nullif(trim(new.raw_user_meta_data->>'full_name'),''),
  case when selected_track in ('MP','PSI','TSI','ECS','ECT','EST') then selected_track else null end);
 insert into public.user_roles(user_id,role) values(new.id,'student');
 return new;
end;
$$;
revoke execute on function public.handle_new_user() from public,anon,authenticated;
