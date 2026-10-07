-- Shared CNC catalogue. Student attempts remain in student_app_state.
create function public.cnc_is_admin() returns boolean language sql stable security invoker
set search_path='' as $$
 select exists(select 1 from public.user_roles where user_id=(select auth.uid()) and role='admin');
$$;
revoke all on function public.cnc_is_admin() from public,anon;
grant execute on function public.cnc_is_admin() to authenticated;

create table public.cnc_exams (
 id uuid primary key default gen_random_uuid(),
 filiere text not null check(filiere in ('MP','PSI','ECS','EST')),
 subject text not null check(length(trim(subject)) between 1 and 100),
 year integer not null check(year between 1990 and 2100),
 subject_path text not null,
 correction_path text,
 published boolean not null default false,
 archived boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default clock_timestamp(),
 check(subject_path ~ ('^' || id::text || '/[a-f0-9-]{36}\.pdf$')),
 check(correction_path is null or correction_path ~ ('^' || id::text || '/[a-f0-9-]{36}\.pdf$')),
 check(not(archived and published))
);
create unique index cnc_exams_unique_edition on public.cnc_exams(filiere,subject,year) where not archived;
alter table public.cnc_exams enable row level security;
revoke all on public.cnc_exams from anon,authenticated;
grant select,insert,update on public.cnc_exams to authenticated;
create policy cnc_catalogue_read on public.cnc_exams for select to authenticated using (
 (select public.cnc_is_admin()) or
 (published and not archived and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and (
 (p.subscription_status='active' and (p.subscription_ends_at is null or p.subscription_ends_at>now())) or
 (p.subscription_status='promo' and p.subscription_ends_at>now()) or
 (p.subscription_status='trial' and p.trial_ends_at>now())
 )))
);
create policy cnc_admin_insert on public.cnc_exams for insert to authenticated with check((select public.cnc_is_admin()));
create policy cnc_admin_update on public.cnc_exams for update to authenticated using((select public.cnc_is_admin())) with check((select public.cnc_is_admin()));
create function public.cnc_touch_updated_at() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.updated_at=clock_timestamp(); return new; end;
$$;
revoke all on function public.cnc_touch_updated_at() from public,anon,authenticated;
create trigger cnc_updated_at before update on public.cnc_exams for each row execute function public.cnc_touch_updated_at();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('cnc-documents','cnc-documents',false,20971520,array['application/pdf']);
create policy cnc_document_upload on storage.objects for insert to authenticated
with check(bucket_id='cnc-documents' and (select public.cnc_is_admin()) and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.pdf$');
create policy cnc_document_read on storage.objects for select to authenticated
using(bucket_id='cnc-documents' and (
 (select public.cnc_is_admin()) or exists(select 1 from public.cnc_exams e where e.published and not e.archived and (e.subject_path=name or e.correction_path=name))
));
-- No public bucket, no student uploads, no overwrite/delete policy. Replacements
-- use new paths; archived records/files are retained for safe restoration.
