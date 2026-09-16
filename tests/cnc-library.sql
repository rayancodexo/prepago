-- Disposable records and Storage metadata only; everything rolls back.
begin;
do $$
declare
 a uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); e uuid:=gen_random_uuid();
 p text; c text; n integer; rev timestamptz;
begin
 p=e::text||'/'||gen_random_uuid()::text||'.pdf';
 c=e::text||'/'||gen_random_uuid()::text||'.pdf';
 insert into auth.users(id,email,raw_user_meta_data) values
 (a,a::text||'@example.invalid','{"full_name":"QA Admin"}'),
 (s,s::text||'@example.invalid','{"full_name":"QA Student","role":"admin"}');
 update public.user_roles set role='admin' where user_id=a;
 assert (select role='student' from public.user_roles where user_id=s),'Metadata granted admin';
 perform set_config('request.jwt.claim.sub',a::text,true);
 set local role authenticated;
 assert public.cnc_is_admin(),'Admin not recognized';
 insert into storage.objects(bucket_id,name) values('cnc-documents',p),('cnc-documents',c);
 insert into public.cnc_exams(id,filiere,subject,year,subject_path,correction_path)
 values(e,'PSI','Mathématiques I',2025,p,c);
 assert (select count(*)=1 from public.cnc_exams where id=e),'Admin cannot see draft';
 reset role;
 perform set_config('request.jwt.claim.sub',s::text,true);
 update public.profiles set subscription_status='active' where id=s;
 set local role authenticated;
 assert not public.cnc_is_admin(),'Student recognized as admin';
 assert (select count(*)=0 from public.cnc_exams where id=e),'Draft leaked';
 assert (select count(*)=0 from storage.objects where bucket_id='cnc-documents' and name in(p,c)),'Draft PDF leaked';
 begin
  insert into storage.objects(bucket_id,name) values('cnc-documents',e::text||'/'||gen_random_uuid()::text||'.pdf');
  raise exception 'Student uploaded a PDF';
 exception when insufficient_privilege then null; end;
 begin
  update public.user_roles set role='admin' where user_id=s;
  get diagnostics n=row_count;assert n=0,'Student escalated role';
 exception when insufficient_privilege then null; end;
 update public.cnc_exams set published=true where id=e;
 get diagnostics n=row_count;assert n=0,'Student published draft';
 insert into public.student_app_state(user_id,data) values(s,'{"cnc":{"notes":"private","score":16}}');
 reset role;
 perform set_config('request.jwt.claim.sub',a::text,true);
 set local role authenticated;
 update public.cnc_exams set published=true where id=e returning updated_at into rev;
 reset role;
 perform set_config('request.jwt.claim.sub',s::text,true);
 set local role authenticated;
 assert (select count(*)=1 from public.cnc_exams where id=e),'Published exam unavailable';
 assert (select count(*)=2 from storage.objects where bucket_id='cnc-documents' and name in(p,c)),'Published PDFs unavailable';
 update public.cnc_exams set subject='Hacked' where id=e;
 get diagnostics n=row_count;assert n=0,'Student changed published exam';
 reset role;
 update public.profiles set subscription_status='inactive' where id=s;
 set local role authenticated;
 assert (select count(*)=0 from public.cnc_exams where id=e),'Inactive account sees catalogue';
 assert (select count(*)=0 from storage.objects where bucket_id='cnc-documents' and name=p),'Inactive account sees PDF';
 reset role;
 perform set_config('request.jwt.claim.sub',a::text,true);
 set local role authenticated;
 update public.cnc_exams set published=false,archived=true where id=e;
 update public.cnc_exams set published=true where id=e and updated_at=rev;
 get diagnostics n=row_count;assert n=0,'Stale update overwrote archive';
 assert (select count(*)=0 from public.student_app_state where user_id=s),'Admin read student notes';
 reset role;
 assert (select data->'cnc'->>'notes'='private' from public.student_app_state where user_id=s),'Archive deleted notes';
 assert (select public=false and file_size_limit=20971520 from storage.buckets where id='cnc-documents'),'Unsafe bucket configuration';
end $$;
rollback;
