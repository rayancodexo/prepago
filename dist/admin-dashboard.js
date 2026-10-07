// Administration uses server-verified roles. No student workspace data is read.
(()=>{
 let client=null,enabled=false,generation=0,snapshot=null,catalogue=[],reports=[],contentHealth=null,busy=false,tab='overview',query='',filter='all';
 const dialog=document.createElement('dialog');dialog.className='prepago-admin';dialog.setAttribute('aria-labelledby','adminTitle');document.body.append(dialog);
 const statuses={active:'Actif',inactive:'Inactif',expired:'Expiré',cancelled:'Annulé',promo:'Promo',trial:'Essai'};
 const date=v=>v?new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium'}).format(new Date(v)):'—';
 function hasAccess(a){const end=a.subscription_status==='trial'?a.trial_ends_at:a.subscription_ends_at;return ['active','promo','trial'].includes(a.subscription_status)&&(!end?a.subscription_status==='active':Date.parse(end)>Date.now())}
 function controls(){
  document.querySelectorAll('[data-admin-open],.admin-role-badge,.admin-account-entry').forEach(n=>n.remove());
  if(!enabled)return;
  document.querySelector('#mainNav')?.insertAdjacentHTML('beforeend',`<button type="button" class="admin-nav" data-admin-open>${uiIcon('projects')} Administration</button>`);
  (document.querySelector('.sidebar-profile')||document.querySelector('.profile-card'))?.insertAdjacentHTML('beforeend','<span class="admin-role-badge">Admin</span>');
  document.querySelector('#accessGate')?.insertAdjacentHTML('beforeend','<button type="button" class="secondary-btn" data-admin-open>Ouvrir l’administration</button>');
  document.querySelector('#page .account-grid')?.insertAdjacentHTML('afterbegin','<section class="activity-panel admin-account-entry"><span class="tag">Administrateur</span><h2>Administration Prepago</h2><p>Étudiants, accès, annales et codes promo.</p><button type="button" class="primary-btn" data-admin-open>Ouvrir l’administration</button></section>');
 }
 function clear(){generation++;client=null;enabled=false;snapshot=null;catalogue=[];reports=[];contentHealth=null;busy=false;query='';filter='all';dialog.close();dialog.innerHTML='';controls()}
 function connect(c,isAdmin){clear();client=c;enabled=Boolean(isAdmin);controls()}
 async function load(){
  if(!client||!enabled)return;const g=generation,c=client;
  const [a,b,r,h]=await Promise.all([c.rpc('admin_dashboard'),c.from('cnc_exams').select('*').order('year',{ascending:false}).limit(5000),window.PrepagoSupport.adminReports(),fetch('cnc-health.json?v=58').then(res=>res.ok?res.json():null).catch(()=>null)]);
  if(g!==generation)return;
  if(a.error||b.error){snapshot=null;catalogue=[];throw a.error||b.error}
  snapshot=a.data;catalogue=b.data||[];reports=r;contentHealth=h;
 }
 function note(message,error=false){const n=dialog.querySelector('#adminStatus');if(n){n.textContent=message;n.classList.toggle('error',error)}}
 const visible=()=>catalogue.filter(r=>r.published&&!r.archived);
 function overview(){
  const accounts=snapshot?.accounts||[],students=accounts.filter(a=>a.role!=='admin'),papers=visible();
  return `<div class="admin-metrics">${[['Étudiants',students.length],['Accès ouverts',students.filter(hasAccess).length],['Sujets publiés',papers.length],['Corrigés',papers.filter(p=>p.correction_path||p.correction_url).length]].map(([label,n])=>`<div><span>${label}</span><strong>${n}</strong></div>`).join('')}</div><div class="admin-overview-grid"><section class="admin-panel"><h2>À suivre</h2><button data-admin-tab="students">${students.filter(a=>!hasAccess(a)).length} étudiants sans accès</button><button data-admin-tab="students">${students.filter(a=>!a.email_verified).length} e-mails à confirmer</button><button data-admin-tab="content">${papers.filter(p=>!p.correction_path&&!p.correction_url).length} sujets sans corrigé</button><button data-admin-tab="content">${catalogue.filter(p=>!p.published&&!p.archived).length} brouillons à publier</button></section><section class="admin-panel"><h2>Dernières inscriptions</h2>${students.slice(0,5).map(a=>`<div class="admin-new-account"><span><strong>${esc(a.full_name||'Étudiant')}</strong><small>${esc(a.filiere||'Filière à choisir')} · ${date(a.created_at)}</small></span><span class="admin-status-pill">${hasAccess(a)?'Accès ouvert':'Sans accès'}</span></div>`).join('')||'<p>Aucune inscription.</p>'}</section></div>`;
 }
 function accounts(){
  const all=(snapshot?.accounts||[]).filter(a=>a.role!=='admin');
  const list=all.filter(a=>(filter==='all'||(filter==='active'?hasAccess(a):!hasAccess(a)))&&`${a.full_name} ${a.email} ${a.filiere}`.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr')));
  return `<div class="admin-filter"><label>Rechercher<input id="adminSearch" value="${esc(query)}" placeholder="Nom, e-mail ou filière"></label><label>Accès<select id="adminFilter"><option value="all">Tous</option><option value="active" ${filter==='active'?'selected':''}>Ouvert</option><option value="inactive" ${filter==='inactive'?'selected':''}>Sans accès</option></select></label><span>${list.length} étudiants</span></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Étudiant</th><th>Filière</th><th>Accès</th><th>Fin</th><th>Dernière connexion</th><th></th></tr></thead><tbody>${list.map(a=>`<tr><td><strong>${esc(a.full_name||'Étudiant')}</strong><small>${esc(a.email)} · ${a.email_verified?'E-mail confirmé':'Non confirmé'}</small></td><td>${esc(a.filiere||'—')}</td><td><span class="admin-status-pill ${hasAccess(a)?'open':''}">${statuses[a.subscription_status]||'Inactif'}</span><small>${a.subscription_plan==='ai_plus'?'AI+':'Prepago'}</small></td><td>${date(a.subscription_status==='trial'?a.trial_ends_at:a.subscription_ends_at)}</td><td>${date(a.last_sign_in_at)}</td><td><button class="secondary-btn" data-admin-access="${a.id}">Gérer l’accès</button></td></tr>`).join('')||'<tr><td colspan="6">Aucun étudiant correspondant.</td></tr>'}</tbody></table></div>`;
 }
 function content(){
  const years=Array.from({length:10},(_,i)=>new Date().getFullYear()-i),papers=visible();
  return `<div class="admin-content-actions"><button class="primary-btn" data-admin-annale>Ajouter ou modifier une annale</button><span>Les cases indiquent les années avec un sujet publié.</span></div><div class="admin-coverage">${['MP','PSI','TSI','ECS','ECT'].map(f=>`<section class="admin-panel"><h2>${f} <small>${f==='ECS'||f==='ECT'?'CNAEM':'CNC'}</small></h2><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Matière</th>${years.map(y=>`<th>${y}</th>`).join('')}</tr></thead><tbody>${(CNC_SUBJECTS[f]||[]).map(s=>`<tr><td>${esc(s)}</td>${years.map(y=>{const r=papers.find(p=>p.filiere===f&&p.subject===s&&p.year===y);return `<td title="${r?(r.correction_path||r.correction_url?'Sujet et corrigé':'Sujet seul'):'Sujet manquant'}"><span class="admin-coverage-dot ${r?'filled':''}">${r?(r.correction_path||r.correction_url?'✓':'•'):'—'}</span></td>`}).join('')}</tr>`).join('')}</tbody></table></div></section>`).join('')}</div>`;
 }
 function history(){return `<section class="admin-panel"><h2>Historique des accès</h2>${(snapshot?.activity||[]).map(a=>`<article class="admin-audit"><strong>${esc(a.full_name||'Compte étudiant')}</strong><span>${statuses[a.previous_access.status]||a.previous_access.status} → ${statuses[a.new_access.status]||a.new_access.status} · fin : ${date(a.new_access.ends_at)}</span><p>${esc(a.reason)}</p><small>${date(a.created_at)}</small></article>`).join('')||'<p>Aucune modification d’accès.</p>'}</section>`}
 function reportList(){
  const list=reports.filter(r=>r.kind!=='technical');
  return `<section class="admin-panel"><h2>Signalements des étudiants</h2><p>${list.filter(r=>r.status!=='resolved').length} à traiter · ${list.length} dans la liste récente</p>${list.map(r=>`<article class="support-report"><div class="admin-report-summary"><strong>${esc(r.title)}</strong><span class="admin-status-pill">${window.PrepagoSupport.labels[r.status]}</span></div><small>${esc(window.PrepagoSupport.kinds[r.kind])} · ${esc(r.page)} · ${date(r.created_at)} · ${esc(r.id.slice(0,8))}</small><p>${esc(r.details)}</p>${r.context?.filiere?`<p>${esc(r.context.filiere)} · ${esc(r.context.subject||'')} · ${esc(r.context.year||'')}</p>`:''}<form class="admin-report-form" data-admin-report="${r.id}"><label>État<select name="status">${Object.entries(window.PrepagoSupport.labels).map(([v,l])=>`<option value="${v}" ${v===r.status?'selected':''}>${l}</option>`).join('')}</select></label><label>Réponse à l’étudiant<textarea name="reply" maxlength="1500">${esc(r.reply)}</textarea></label><button class="secondary-btn" type="submit">Enregistrer la réponse</button></form></article>`).join('')||'<p>Aucun signalement pour le moment.</p>'}</section>`;
 }
 function health(){
  const diagnostics=reports.filter(r=>r.kind==='technical'),papers=visible();
  return `<div class="admin-overview-grid"><section class="admin-panel"><h2>Diagnostics partagés</h2><p>Les étudiants activent ce partage dans Mon compte. Les diagnostics contiennent la page et un code, sans contenu de travail.</p>${diagnostics.slice(0,30).map(r=>`<article class="support-report"><strong class="admin-diagnostic-code">${esc(r.title)}</strong><small> · ${esc(r.page)} · ${date(r.created_at)}</small></article>`).join('')||'<p>Aucun diagnostic reçu.</p>'}</section><section class="admin-panel"><h2>Qualité des annales</h2><p>${papers.length} sujets publiés · ${papers.filter(r=>!r.correction_url&&!r.correction_path).length} corrigés manquants.</p>${contentHealth?`<p>Vérification du ${date(contentHealth.checked_at)} : ${contentHealth.checked_links} liens contrôlés, ${contentHealth.available_links} disponibles, ${contentHealth.broken_links} introuvables et ${contentHealth.unverified_links} à vérifier.</p>${contentHealth.issues.map(r=>`<article class="support-report"><strong>${esc(r.filiere)} · ${esc(r.subject)} · ${r.year}</strong><p>${r.document==='correction'?'Corrigé':'Sujet'} : ${r.status==='broken'?'lien introuvable':'accès non confirmé'}</p></article>`).join('')}`:'<p>Vérification des liens indisponible.</p>'}<button class="secondary-btn" data-admin-tab="content">Voir la couverture des contenus</button></section></div>`;
 }
 function draw(){if(!enabled||!dialog.open)return;dialog.innerHTML=`<header class="admin-heading"><div><span>PREPAGO · ADMINISTRATION</span><h1 id="adminTitle">Piloter Prepago</h1></div><div><button class="secondary-btn" data-admin-refresh>Actualiser</button><button class="secondary-btn" data-admin-close>Fermer</button></div></header><nav class="admin-tabs" aria-label="Administration">${[['overview','Vue d’ensemble'],['students','Étudiants'],['content','Contenus'],['reports','Signalements'],['health','État du service'],['history','Historique']].map(([id,label])=>`<button data-admin-tab="${id}" aria-pressed="${tab===id}">${label}</button>`).join('')}<button data-admin-promos>Codes promo</button></nav><p id="adminStatus" role="status"></p><div class="admin-body">${snapshot?({overview,students:accounts,content,reports:reportList,health,history}[tab]||overview)():'Chargement de l’administration…'}</div>`}
 async function open(){if(!enabled)return;tab='overview';if(!dialog.open)dialog.showModal();draw();try{await load();draw()}catch{note('Impossible de charger l’administration. Vérifie ta connexion et tes droits.',true)}}
 function editAccess(id){
  const a=snapshot?.accounts.find(a=>a.id===id);if(!a||a.role==='admin')return;
  dialog.querySelector('.admin-body').innerHTML=`<section class="admin-panel admin-access-editor"><button class="link-btn" data-admin-tab="students">Retour aux étudiants</button><h2>${esc(a.full_name||'Étudiant')}</h2><p>${esc(a.email)}</p><form id="adminAccessForm" data-user="${a.id}"><div class="admin-filter"><label>Action<select name="status"><option value="active">Accorder / prolonger l’accès</option><option value="inactive">Désactiver l’accès</option><option value="cancelled">Annuler l’accès</option><option value="expired">Marquer expiré</option></select></label><label>Formule<select name="plan"><option value="standard">Prepago</option><option value="ai_plus" ${a.subscription_plan==='ai_plus'?'selected':''}>Prepago AI+ (en préparation)</option></select></label><label>Jours à ajouter<input name="days" type="number" min="1" max="3650" value="30"></label></div><p>Les jours s’ajoutent à l’accès restant. Les données de l’étudiant sont conservées.</p><label>Motif de la modification<input name="reason" minlength="3" maxlength="250" placeholder="Ex. Paiement reçu, accès offert…" required></label><button class="primary-btn" type="submit">Enregistrer l’accès</button></form></section>`;
 }
 dialog.addEventListener('click',async e=>{
  if(busy)return;
  if(e.target.closest('[data-admin-close]'))dialog.close();
  const t=e.target.closest('[data-admin-tab]');if(t){tab=t.dataset.adminTab;draw()}
  const edit=e.target.closest('[data-admin-access]');if(edit)editAccess(edit.dataset.adminAccess);
  if(e.target.closest('[data-admin-promos]'))window.PrepagoPromos?.open();
  if(e.target.closest('[data-admin-annale]')){try{await window.PrepagoCncLibrary?.refresh();window.PrepagoCncLibrary?.open()}catch{note('Impossible de charger les annales. Réessaie après actualisation.',true)}}
  if(e.target.closest('[data-admin-refresh]')){note('Actualisation…');try{await load();draw()}catch{draw();note('Actualisation impossible.',true)}}
 });
 dialog.addEventListener('input',e=>{if(e.target.id==='adminSearch'){query=e.target.value;const start=e.target.selectionStart;draw();const n=dialog.querySelector('#adminSearch');n.focus();n.setSelectionRange(start,start)}});
 dialog.addEventListener('change',e=>{if(e.target.id==='adminFilter'){filter=e.target.value;draw()}});
 dialog.addEventListener('submit',async e=>{
  if(e.target.matches('[data-admin-report]')){
   e.preventDefault();if(busy||!enabled)return;const form=e.target,row=reports.find(r=>r.id===form.dataset.adminReport),g=generation;if(!row)return;
   busy=true;form.querySelector('button').disabled=true;note('Enregistrement de la réponse…');
   try{await window.PrepagoSupport.replyReport(row,Object.fromEntries(new FormData(form)));if(g!==generation)return;await load();draw();note('Réponse enregistrée. L’étudiant la verra dans ses signalements.');}
   catch(err){if(g===generation)note(err.message==='conflict'?'Ce signalement a changé. Actualise avant de réessayer.':'Impossible d’enregistrer la réponse.',true);}
   finally{if(g===generation){busy=false;if(form.isConnected)form.querySelector('button').disabled=false;}}return;
  }
  if(e.target.id!=='adminAccessForm')return;e.preventDefault();if(busy||!enabled)return;
  const form=e.target,a=snapshot.accounts.find(a=>a.id===form.dataset.user),v=Object.fromEntries(new FormData(form)),g=generation,c=client;
  busy=true;form.querySelector('button[type=submit]').disabled=true;note('Enregistrement…');
  try{const result=await c.rpc('admin_set_student_access',{target_user:a.id,new_status:v.status,new_plan:v.plan,access_days:Number(v.days),change_reason:v.reason.trim(),expected_access:{status:a.subscription_status,plan:a.subscription_plan,ends_at:a.subscription_ends_at}});if(result.error)throw result.error;if(g!==generation)return;await load();tab='students';draw();note('Accès mis à jour. La modification est enregistrée dans l’historique.')}
  catch(err){if(g===generation)note(err.code==='40001'?'Le compte a changé. Actualise avant de réessayer.':'Impossible d’enregistrer cet accès. Vérifie les champs et tes droits.',true)}
  finally{if(g===generation){busy=false;if(form.isConnected)form.querySelector('button[type=submit]').disabled=false}}
 });
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
 document.addEventListener('click',e=>{if(e.target.closest('[data-admin-open]'))void open()});
 const accountBase=renderAccount;renderAccount=function(){accountBase();controls()};
 window.PrepagoAdmin={connect,clear,controls,open};
})();
