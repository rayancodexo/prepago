-- All fixtures are rolled back. This tests DB triggers/RLS/RPC, not email delivery.
begin;
do $$
#variable_conflict use_variable
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); code text:='QA-'||gen_random_uuid()::text;
 result record; n integer; revision timestamptz;
begin
 insert into auth.users(id,email,raw_user_meta_data) values
 (a,a::text||'@example.invalid','{"full_name":"QA A","filiere":"PSI"}'),
 (b,b::text||'@example.invalid','{"full_name":"QA B","filiere":"MP"}');
 assert (select subscription_status='inactive' from public.profiles where id=a),'New user must be inactive';
 assert (select role='student' from public.user_roles where user_id=a),'Student role missing';
 insert into public.promo_codes(code,duration_days,max_uses,active) values(code,30,1,false);
 perform set_config('request.jwt.claim.sub',a::text,true);
 set local role authenticated;
 select * into result from public.redeem_promo_code('NO-SUCH-'||code);
 assert not result.success,'Invalid code accepted';
 select * into result from public.redeem_promo_code(code);
 assert not result.success and result.message='This promo code is inactive','Inactive code accepted';
 select count(*) into n from public.profiles;
 assert n=1,'Profiles leak across users';
 begin
  update public.profiles set subscription_status='active' where id=a;
  raise exception 'Student changed subscription';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into public.student_app_state(user_id,data) values(a,'{}');
  raise exception 'Inactive account wrote state';
 exception when insufficient_privilege then null;
 end;
 reset role;
 update public.promo_codes set active=true,expires_at=now()-interval '1 day' where promo_codes.code=code;
 set local role authenticated;
 select * into result from public.redeem_promo_code(code);
 assert not result.success and result.message='This promo code has expired','Expired code accepted';
 reset role;
 update public.promo_codes set expires_at=null where promo_codes.code=code;
 set local role authenticated;
 select * into result from public.redeem_promo_code(lower(code));
 assert result.success,'Valid code failed';
 insert into public.student_app_state(user_id,data) values(a,'{"tasks":[{"title":"QA"}]}');
 select updated_at into revision from public.student_app_state where user_id=a;
 select * into result from public.save_student_state('{"tasks":[{"title":"QA"}],"version":2}',revision);
 assert result.saved,'Current revision did not save';
 select * into result from public.save_student_state('{"tasks":[],"version":1}',revision);
 assert not result.saved,'Stale device overwrote newer data';
 assert (select (data->>'version')::int=2 from public.student_app_state where user_id=a),'Conflict destroyed newer state';
 select * into result from public.redeem_promo_code(code);
 assert not result.success,'Repeated redemption accepted';
 reset role;
 assert (select used_count=1 from public.promo_codes where promo_codes.code=code),'Wrong usage count';
 assert (select count(*)=1 from public.promo_redemptions where user_id=a),'Wrong redemption count';
 perform set_config('request.jwt.claim.sub',b::text,true);
 update public.profiles set subscription_status='active' where id=b;
 set local role authenticated;
 select count(*) into n from public.student_app_state where user_id=a;
 assert n=0,'Another student read private data';
 update public.student_app_state set data='{}' where user_id=a;
 get diagnostics n=row_count;
 assert n=0,'Another student changed private data';
 reset role;
 update public.profiles set subscription_status='inactive' where id=b;
 set local role authenticated;
 select * into result from public.redeem_promo_code(code);
 assert not result.success and result.message='This promo code has reached its usage limit','Usage cap failed';
 reset role;
 update public.profiles set subscription_status='expired' where id=a;
 assert (select data->'tasks'->0->>'title'='QA' from public.student_app_state where user_id=a),'Expiration destroyed state';
end $$;
rollback;
