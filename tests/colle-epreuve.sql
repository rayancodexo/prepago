-- Simulateur de colle and Mode Épreuve: access rules, duo sessions, contributor reward, barèmes.
-- Disposable records only; everything rolls back.
begin;
do $$
declare
 adm uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); x uuid:=gen_random_uuid();
 q uuid; mine uuid; s jsonb; s2 jsonb; att public.colle_attempts%rowtype; e uuid:=gen_random_uuid();
 bar uuid; bar2 uuid; ea public.exam_attempts%rowtype; n integer; ends timestamptz; i integer; ids uuid[];
begin
 insert into auth.users(id,email) values(adm,adm||'@example.invalid'),(a,a||'@example.invalid'),(b,b||'@example.invalid'),(x,x||'@example.invalid');
 update public.user_roles set role='admin' where user_id=adm;
 update public.profiles set subscription_status='promo',subscription_ends_at=now()+interval '10 days' where id in(a,b);
 select id into q from public.colle_questions where status='approved' and statement like 'Énoncer et démontrer la formule de Moivre%';
 insert into public.cnc_exams(id,filiere,subject,year,subject_url,published)
 values(e,'MP','Mathématiques I',2024,'https://drive.google.com/file/d/qaPaper123/view',true);

 -- Without access, the question bank stays closed.
 perform set_config('request.jwt.claim.sub',x::text,true);
 set local role authenticated;
 assert (select count(*)=0 from public.colle_questions),'Question bank open without access';
 begin
  insert into public.colle_attempts(question_id,mode,score) values(q,'solo',20);
  raise exception 'Attempt saved without access';
 exception when insufficient_privilege then null; end;
 reset role;

 -- A student with access reads the bank and saves a solo attempt; the server computes the score.
 perform set_config('request.jwt.claim.sub',a::text,true);
 set local role authenticated;
 assert (select count(*)=10 from public.colle_questions where chapter='Nombres complexes'),'Seed questions missing';
 insert into public.colle_attempts(question_id,mode,prep_seconds,pass_seconds,checked_items,score)
 values(q,'solo',300,900,'[0,1]',20) returning * into att;
 assert att.score=10 and att.grading_method='self' and att.ai_feedback is null,'Score not recomputed: '||att.score;
 begin
  insert into public.colle_attempts(question_id,mode,score) values(q,'duo',20);
  raise exception 'Student saved a duo attempt directly';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.colle_attempts(question_id,mode,score,grading_method) values(q,'solo',20,'ai');
  raise exception 'Student set the grading method';
 exception when insufficient_privilege then null; end;

 -- Submissions stay pending and private until reviewed.
 insert into public.colle_questions(filiere,subject,chapter,type,statement,checklist,traps)
 values('MPSI','math','Nombres complexes','exercice','Calculer $(1+i)^{10}$.',
  '[{"label":"Forme exponentielle","points":8},{"label":"Puissance","points":8},{"label":"Résultat 32i","points":4}]',
  '[{"question":"Et (1-i)^10 ?","answer":"-32i"}]') returning id into mine;
 assert (select status='pending' and author_user_id=a from public.colle_questions where id=mine),'Submission not pending';
 begin
  insert into public.colle_questions(filiere,subject,chapter,type,statement,checklist,status)
  values('MPSI','math','X','cours','Une question','[{"label":"a","points":1},{"label":"b","points":1},{"label":"c","points":1}]','approved');
  raise exception 'Student approved own question';
 exception when insufficient_privilege then null; end;
 update public.colle_questions set status='approved' where id=mine;
 get diagnostics n=row_count; assert n=0,'Student reviewed a question';
 begin
  insert into public.colle_questions(filiere,subject,chapter,type,statement,checklist)
  values('MPSI','math','X','cours','Une question','[{"label":"a","points":1}]');
  raise exception 'Checklist with one item accepted';
 exception when check_violation then null; end;
 reset role;
 perform set_config('request.jwt.claim.sub',b::text,true);
 set local role authenticated;
 assert (select count(*)=0 from public.colle_questions where id=mine),'Pending submission leaked';
 assert (select count(*)=0 from public.colle_attempts where user_id=a),'Attempt leaked to another student';
 reset role;

 -- Five accepted questions give one month, once.
 perform set_config('request.jwt.claim.sub',a::text,true);
 set local role authenticated;
 for i in 1..5 loop
  insert into public.colle_questions(filiere,subject,chapter,type,statement,checklist)
  values('MPSI','math','Nombres complexes','cours','Question soumise numéro '||i,
   '[{"label":"a","points":1},{"label":"b","points":1},{"label":"c","points":1}]') returning id into q;
  ids=array_append(ids,q);
 end loop;
 assert (public.colle_contribution()->>'pending')::int=6,'Contribution count wrong';
 reset role;
 select subscription_ends_at into ends from public.profiles where id=a;
 perform set_config('request.jwt.claim.sub',adm::text,true);
 set local role authenticated;
 update public.colle_questions set status='approved' where id=any(ids[1:4]);
 reset role;
 assert (select subscription_ends_at=ends from public.profiles where id=a),'Reward granted before five';
 set local role authenticated;
 update public.colle_questions set status='approved' where id=ids[5];
 reset role;
 assert (select subscription_status='promo' and subscription_plan='standard' and subscription_ends_at=ends+interval '30 days'
  from public.profiles where id=a),'Reward not granted at five';
 set local role authenticated;
 update public.colle_questions set status='approved' where id=mine;
 reset role;
 assert (select subscription_ends_at=ends+interval '30 days' from public.profiles where id=a),'Reward granted twice';
 perform set_config('request.jwt.claim.sub',a::text,true);
 set local role authenticated;
 assert (public.colle_contribution()->>'rewarded_at') is not null,'Reward not reported';
 reset role;

 -- Duo: a is the colleur, b the étudiant.
 select id into q from public.colle_questions where status='approved' and statement like 'Énoncer et démontrer la formule de Moivre%';
 perform set_config('request.jwt.claim.sub',a::text,true);
 set local role authenticated;
 s=public.colle_session_create(q,300,900);
 assert s->>'code' ~ '^[0-9]{4}$' and s->>'phase'='waiting' and s->>'role'='colleur','Session not created: '||s;
 begin
  perform public.colle_session_join(s->>'code');
  raise exception 'Colleur joined own session';
 exception when invalid_parameter_value then null; end;
 reset role;
 perform set_config('request.jwt.claim.sub',b::text,true);
 set local role authenticated;
 s2=public.colle_session_join(s->>'code');
 assert s2->>'phase'='ready' and s2->>'role'='etudiant' and s2->>'server_now' is not null,'Join failed: '||s2;
 update public.colle_sessions set checked_items='[0,1,2,3,4]' where id=(s->>'id')::uuid;
 get diagnostics n=row_count; assert n=0,'Étudiant changed the ticks';
 begin
  perform public.colle_session_finish((s->>'id')::uuid,0,0);
  raise exception 'Étudiant finished the colle';
 exception when insufficient_privilege then null; end;
 reset role;
 perform set_config('request.jwt.claim.sub',x::text,true);
 update public.profiles set subscription_status='promo',subscription_ends_at=now()+interval '1 day' where id=x;
 set local role authenticated;
 begin
  perform public.colle_session_join(s->>'code');
  raise exception 'Third student joined';
 exception when invalid_parameter_value then null; end;
 assert (select count(*)=0 from public.colle_sessions where id=(s->>'id')::uuid),'Session visible to a stranger';
 reset role;
 perform set_config('request.jwt.claim.sub',a::text,true);
 set local role authenticated;
 update public.colle_sessions set phase='prep' where id=(s->>'id')::uuid;
 assert (select phase_started_at is not null from public.colle_sessions where id=(s->>'id')::uuid),'Phase not stamped';
 update public.colle_sessions set phase='pass',checked_items='[0,2]' where id=(s->>'id')::uuid;
 begin
  update public.colle_sessions set phase='done' where id=(s->>'id')::uuid;
  raise exception 'Colleur closed the session without finishing';
 exception when insufficient_privilege then null; end;
 s=public.colle_session_finish((s->>'id')::uuid,280,850);
 assert s->>'phase'='done' and (s->>'closed')::boolean,'Finish failed: '||s;
 reset role;
 perform set_config('request.jwt.claim.sub',b::text,true);
 set local role authenticated;
 select * into att from public.colle_attempts where id=(s->>'attempt_id')::uuid;
 assert att.user_id=b and att.mode='duo' and att.score=(s->>'score')::numeric and att.pass_seconds=850,'Duo attempt not saved for the étudiant';
 assert att.score=8,'Duo score differs: '||att.score;
 assert (public.colle_session_state((s->>'id')::uuid)->>'score') is not null,'Étudiant cannot see the score';
 reset role;
 perform set_config('request.jwt.claim.sub',x::text,true);
 set local role authenticated;
 begin
  perform public.colle_session_join(s->>'code');
  raise exception 'Joined a finished colle';
 exception when no_data_found then null; end;
 reset role;

 -- Barèmes: pending until approved, one approved per paper.
 perform set_config('request.jwt.claim.sub',a::text,true);
 set local role authenticated;
 insert into public.exam_baremes(paper_id,questions) values(e,'[{"number":"1","max_points":4,"chapter":"Séries"},{"number":"2","max_points":6}]') returning id into bar;
 begin
  insert into public.exam_baremes(paper_id,questions) values(e,'[{"number":"1","max_points":0}]');
  raise exception 'Barème with zero points accepted';
 exception when check_violation then null; end;
 reset role;
 perform set_config('request.jwt.claim.sub',b::text,true);
 set local role authenticated;
 assert (select count(*)=0 from public.exam_baremes where id=bar),'Pending barème leaked';
 insert into public.exam_baremes(paper_id,questions) values(e,'[{"number":"1","max_points":10},{"number":"2","max_points":10}]') returning id into bar2;
 update public.exam_baremes set status='approved' where id=bar2;
 get diagnostics n=row_count; assert n=0,'Student approved a barème';
 reset role;
 perform set_config('request.jwt.claim.sub',adm::text,true);
 set local role authenticated;
 update public.exam_baremes set status='approved' where id=bar;
 update public.exam_baremes set status='approved' where id=bar2;
 assert (select status='rejected' from public.exam_baremes where id=bar),'Replaced barème still approved';
 update public.cnc_exams set duration_minutes=240 where id=e;
 reset role;
 perform set_config('request.jwt.claim.sub',a::text,true);
 set local role authenticated;
 assert (select count(*)=1 from public.exam_baremes where paper_id=e and status='approved'),'Approved barème hidden';
 insert into public.exam_attempts(paper_id,bareme_id,duration_seconds,used_seconds,pauses,scores,total_20)
 values(e,bar2,14400,13000,2,'[{"number":"1","points":7,"max_points":10},{"number":"2","points":8,"max_points":10,"chapter":"Séries"}]',20)
 returning * into ea;
 assert ea.total_20=15 and ea.grading_method='self','Total not recomputed: '||ea.total_20;
 begin
  insert into public.exam_attempts(paper_id,duration_seconds,used_seconds,scores) values(e,7200,10,'[{"number":"1","points":12,"max_points":10}]');
  raise exception 'Points above the maximum accepted';
 exception when check_violation then null; end;
 update public.exam_attempts set copy_photos=jsonb_build_array(a::text||'/'||ea.id||'/'||gen_random_uuid()||'.jpg') where id=ea.id;
 get diagnostics n=row_count; assert n=1,'Photo path not saved';
 begin
  update public.exam_attempts set copy_photos=jsonb_build_array(b::text||'/x.jpg') where id=ea.id;
  raise exception 'Foreign photo path accepted';
 exception when insufficient_privilege then null; end;
 begin
  update public.exam_attempts set total_20=20 where id=ea.id;
  raise exception 'Student edited the total';
 exception when insufficient_privilege then null; end;
 reset role;
 perform set_config('request.jwt.claim.sub',b::text,true);
 set local role authenticated;
 assert (select count(*)=0 from public.exam_attempts where user_id=a),'Exam attempt leaked';
 reset role;
end $$;
rollback;
