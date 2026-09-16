// Product improvements extend the existing workspace without replacing its data model.
pageNames.overview='Dashboard'; pageNames.subjects='Matières'; pageNames.account='Mon compte'; pageNames.ai='AI Planner';
iconFiles.ai='zap';
const aiNav=document.createElement('button');
aiNav.className='nav-item'; aiNav.dataset.page='ai';
aiNav.innerHTML='<span class="icon"></span>AI Planner';
document.querySelector('#mainNav').append(aiNav);
document.querySelectorAll('.nav-item').forEach(n=>n.innerHTML=`<span class="icon"></span>${pageNames[n.dataset.page]}`);
document.querySelectorAll('[data-action="profile"]').forEach(n=>{n.removeAttribute('data-action');n.dataset.go='account'});
document.querySelector('.notification-dot')?.remove();
document.querySelector('#notificationBtn').addEventListener('click',()=>{
 const due=state.tasks.filter(t=>!t.done&&t.date<=todayISO()).slice(0,5);
 document.querySelector('#notificationPanel').innerHTML='<strong>Échéances à suivre</strong>'+ (due.length?due.map(t=>`<p>${esc(t.title)} · ${t.date<todayISO()?'En retard':'Aujourd’hui'}</p>`).join('')+'<button class="link-btn" data-go="tasks">Voir mes tâches</button>':'<p>Aucune tâche en retard ou à terminer aujourd’hui.</p>');
});
const productOpenModal=openModal;
openModal=function(...args){productOpenModal(...args);document.querySelectorAll('#modalForm input[type="text"][required]').forEach(input=>{input.pattern='.*\\S.*';input.title='Saisissez au moins un caractère autre qu’un espace.'})};

function restoreRuntimeState(){
 state.focusSettings={work:25,break:5,goal:4,subject:'',objective:'',...state.focusSettings};
 focusRun={mode:'work',duration:state.focusSettings.work*60,left:state.focusSettings.work*60,running:false,stamp:0,segments:{},subject:'',...state.focusRun};
 focusRun.segments||={};
 state.cnc={papers:{},...state.cnc}; state.cnc.papers||={};
 cncTimer={paperId:null,duration:14400,left:14400,running:false,stamp:0,...state.cnc.timer};
 cncView={screen:'filieres',filiere:null,subject:null,year:null};
 learningSubjectId=null; currentPage='overview'; selectedDay=todayISO();
}
window.addEventListener('prepago:state-replaced',restoreRuntimeState);
window.addEventListener('prepago:pause-timers',()=>{
 settleFocus(); focusRun.running=false; persistFocus();
 settleCncTimer(); cncTimer.running=false; persistCnc();
});
restoreRuntimeState();
const settleFocusBase=settleFocus,settleCncBase=settleCncTimer;
settleFocus=function(...args){if(!document.body.classList.contains('auth-pending'))settleFocusBase(...args)};
settleCncTimer=function(...args){if(!document.body.classList.contains('auth-pending'))settleCncBase(...args)};
const persistFocusBase=persistFocus,persistCncBase=persistCnc;
persistFocus=function(){if(!document.body.classList.contains('auth-pending'))persistFocusBase()};
persistCnc=function(){if(!document.body.classList.contains('auth-pending'))persistCncBase()};

progressPercent=function(){const chapters=allChapters();return chapters.length?Math.round(chapters.reduce((n,c)=>n+chapterUnits(c),0)/(chapters.length*5)*100):0};
const renderOverviewBase=renderOverview;
renderOverview=function(){renderOverviewBase();const profile=state.profileName==='Préparationnaire'?'':state.profileName;document.querySelector('.dashboard-heading h1').textContent=profile?`Bonjour, ${profile.trim().split(/\s+/)[0]}`:'Bonjour';};
const updateSidebarProductBase=updateSidebar;
updateSidebar=function(){updateSidebarProductBase();if(!state.profileName||state.profileName==='Préparationnaire'){document.querySelector('#sideProfileName').textContent='Mon compte';document.querySelector('#topbarProfileName').textContent='Mon compte';document.querySelector('.sidebar-avatar').textContent='P';document.querySelector('#topbarAvatar').textContent='P'}};

const taskRowBase=taskRow;
taskRow=function(t,editable){return taskRowBase(t,editable).replace('<div class="task-meta">',`<div class="task-meta"><span class="task-priority">${{high:'Prioritaire',medium:'Normale',low:'Flexible'}[t.priority]||'Normale'}</span>`)};
renderTasks=function(){
 let tasks=[...state.tasks].sort((a,b)=>Number(a.done)-Number(b.done)||a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||''));
 if(taskView==='today')tasks=tasks.filter(t=>t.date===todayISO());
 if(taskView==='upcoming')tasks=tasks.filter(t=>!t.done&&t.date>todayISO());
 if(taskView==='open')tasks=tasks.filter(t=>!t.done);
 if(taskView==='done')tasks=tasks.filter(t=>t.done);
 document.querySelector('#page').innerHTML=header('Tâches','Vos priorités et vos échéances.',`<button class="primary-btn" data-task-new>+ Nouvelle tâche</button>`)+`<div class="view-tabs">${[['all','Toutes'],['today','Aujourd’hui'],['upcoming','À venir'],['open','À faire'],['done','Terminées']].map(([v,l])=>`<button data-task-view="${v}" class="${taskView===v?'active':''}" aria-pressed="${taskView===v}">${l}</button>`).join('')}</div><section class="task-surface">${tasks.map(t=>taskRow(t,true)).join('')||'<div class="desk-empty"><h3>Aucune tâche dans cette vue</h3><p>Planifiez votre prochaine révision.</p><button class="secondary-btn" data-task-new>Ajouter une tâche</button></div>'}</section>`;
};
const renderCalendarBase=renderCalendar;
renderCalendar=function(){renderCalendarBase();document.querySelector('.day-agenda').insertAdjacentHTML('beforeend','<button class="secondary-btn" data-calendar-task>+ Ajouter une tâche ce jour</button>')};
const renderSubjectsBase=renderSubjects;
renderSubjects=function(){
 renderSubjectsBase();
 document.querySelectorAll('.subject-hub-card').forEach((card,i)=>card.insertAdjacentHTML('beforeend',`<button class="link-btn rename-subject" data-rename-subject="${esc(state.subjects[i].id)}">Renommer</button>`));
 if(learningSubjectId){
  document.querySelector('.section-head').insertAdjacentHTML('beforeend',`<button class="secondary-btn" data-rename-subject="${esc(learningSubjectId)}">Renommer la matière</button>`);
  document.querySelectorAll('[data-chapter-card]').forEach(card=>card.querySelector('.chapter-card-head').insertAdjacentHTML('beforeend',`<button class="link-btn" data-rename-chapter="${esc(card.dataset.chapterCard)}">Renommer</button>`));
 }
};
const renderFocusBase=renderFocus;
renderFocus=function(){
 renderFocusBase();const locked=focusRun.running||focusRun.left<focusRun.duration;
 document.querySelector('.focus-main .mode-switch').insertAdjacentHTML('afterend',`<div class="focus-presets">${[15,25,45,60].map(n=>`<button class="secondary-btn" data-focus-preset="${n}" ${locked?'disabled':''}>${n} min</button>`).join('')}</div>`);
 document.querySelector('.timer-actions').insertAdjacentHTML('beforeend',`<button class="link-btn" data-focus-reset ${!locked?'disabled':''}>Réinitialiser</button>`);
 document.querySelector('#focusSettings').insertAdjacentHTML('afterbegin',`<div class="field"><label for="sessionObjective">Objectif de la session</label><input id="sessionObjective" maxlength="180" value="${esc(focusRun.objective||state.focusSettings.objective||'')}" placeholder="Ex. Terminer deux exercices" ${locked?'disabled':''}></div>`);
};
const finishFocusProductBase=finishFocus;
finishFocus=function(){const before=state.focusSessions.length,objective=focusRun.objective||state.focusSettings.objective||'';finishFocusProductBase();state.focusSessions.slice(before).forEach(s=>s.objective=objective);save()};

function activityDates(){return new Set([...state.focusSessions.filter(s=>s.minutes>0).map(s=>s.date),...state.tasks.filter(t=>t.done).map(t=>t.completedAt),...allChapters().map(c=>c.completedAt)].filter(Boolean))}
function currentStreak(){const dates=activityDates();let d=new Date(),n=0;if(!dates.has(localISO(d)))d.setDate(d.getDate()-1);while(dates.has(localISO(d))){n++;d.setDate(d.getDate()-1)}return n}
let progressRange='week';
renderProgress=function(){
 const dates=dashboardPeriodDates(progressRange),minutes=dates.map(focusMinutesOn),max=Math.max(60,...minutes);
 const total=state.focusSessions.reduce((sum,s)=>sum+Number(s.minutes||0),0);
 document.querySelector('#page').innerHTML=header('Progression','Vos résultats, calculés à partir de votre travail.')+`<div class="progress-overview"><div><strong>${progressPercent()} %</strong><span>Programme terminé</span></div><div><strong>${state.xp} XP</strong><span>Niveau ${level()}</span></div><div><strong>${doneChapters()}</strong><span>Chapitres terminés</span></div><div><strong>${completedTasks()}</strong><span>Tâches terminées</span></div><div><strong>${studyHours(total*60)}</strong><span>Total étudié</span></div><div><strong>${currentStreak()} j</strong><span>Série en cours</span></div></div><div class="view-tabs">${[['week','Semaine'],['month','Mois']].map(([v,l])=>`<button data-progress-range="${v}" aria-pressed="${progressRange===v}" class="${progressRange===v?'active':''}">${l}</button>`).join('')}</div><section class="activity-panel"><h2>${studyHours(minutes.reduce((a,b)=>a+b,0)*60)} étudiées ${progressRange==='week'?'cette semaine':'ce mois-ci'}</h2><div class="activity-chart ${progressRange==='month'?'monthly':''}">${dates.map((d,i)=>`<div class="activity-bar"><span title="${formatShort(d)} : ${Math.floor(minutes[i])} min" style="height:${Math.max(2,minutes[i]/max*150)}px"></span><small>${d.slice(-2)}</small></div>`).join('')}</div><p class="helper">Temps de concentration réel, hors pauses. Une tâche terminée ou une session d’étude entretient votre série.</p></section><section class="activity-panel"><h2>Maîtrise par matière</h2>${state.subjects.map(s=>`<div class="mastery-progress-row"><div><strong>${esc(s.name)}</strong><span>${subjectMastery(s)} %</span></div><div class="progress-bar"><div class="progress-fill" style="width:${subjectMastery(s)}%"></div></div></div>`).join('')||'<p>Ajoutez une matière pour suivre votre progression.</p>'}</section>`;
};
function renderAccount(){
 const account=window.PrepagoAccount,p=account?.profile||{};
 const expires=p.subscription_status==='trial'?p.trial_ends_at:p.subscription_ends_at;
 const expiry=expires?new Intl.DateTimeFormat('fr-FR',{dateStyle:'long'}).format(new Date(expires)):'Sans date renseignée';
 document.querySelector('#page').innerHTML=header('Mon compte','Votre profil et votre accès à Prepago.')+`<div class="account-grid"><section class="activity-panel"><h2>Profil étudiant</h2><form id="accountForm"><div class="field"><label for="accountName">Nom complet</label><input id="accountName" name="full_name" maxlength="100" required value="${esc(p.full_name||state.profileName)}"></div><div class="field"><label for="accountEmail">Adresse e-mail</label><input id="accountEmail" type="email" readonly value="${esc(account?.email||'')}"></div><div class="field"><label for="accountFiliere">Filière</label><select id="accountFiliere" name="filiere" required>${['MP','PSI','ECS','EST'].map(f=>`<option ${p.filiere===f?'selected':''}>${f}</option>`).join('')}</select></div><button class="primary-btn" type="submit">Enregistrer le profil</button><p id="accountMessage" role="status"></p></form></section><section class="activity-panel"><h2>Abonnement</h2><dl class="account-details"><dt>Formule</dt><dd>${p.subscription_plan==='ai_plus'?'Prepago AI+':'Prepago'}</dd><dt>Statut</dt><dd>${esc(account?.statusLabel(p)||'Inactif')}</dd><dt>Fin de l’accès</dt><dd>${esc(expiry)}</dd><dt>Accès promo</dt><dd>${p.subscription_status==='promo'?'Activé':'Non'}</dd></dl><p class="helper">Vos données restent conservées après l’expiration de votre accès.</p><button class="secondary-btn" data-account-logout>Se déconnecter</button></section></div>`;
 document.querySelector('#accountForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button'),msg=document.querySelector('#accountMessage');b.disabled=true;msg.textContent='Enregistrement…';try{await account.update(Object.fromEntries(new FormData(e.target)));navigate('account');document.querySelector('#accountMessage').textContent='Profil enregistré.'}catch{msg.textContent='Impossible d’enregistrer le profil. Vérifiez votre connexion.'}finally{b.disabled=false}};
}
function renderAI(){const entitled=window.PrepagoAccount?.profile.subscription_plan==='ai_plus';document.querySelector('#page').innerHTML=header('AI Planner','Votre futur assistant de révision.')+`<section class="activity-panel ai-placeholder"><span class="tag">Bientôt disponible</span><h2>${entitled?'Votre espace Prepago AI+':'Inclus dans Prepago AI+'}</h2><p>Plans d’étude personnalisés, génération de planning et recommandations adaptées à votre progression.</p><p>Aucun service d’IA n’est encore connecté. Aucune génération ni facturation n’est effectuée.</p><button class="secondary-btn" data-go="account">Voir mon abonnement</button></section>`}
const renderProductBase=render;
render=function(){if(currentPage==='account')renderAccount();else if(currentPage==='ai')renderAI();else renderProductBase();document.body.dataset.page=currentPage;document.querySelectorAll('.nav-item').forEach(n=>{const active=n.dataset.page===currentPage;n.classList.toggle('active',active);if(active)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current')});refreshIcons();updateSidebar()};
document.addEventListener('click',e=>{
 const rename=e.target.closest('[data-rename-subject]');if(rename){const s=state.subjects.find(s=>s.id===rename.dataset.renameSubject);openModal('Renommer la matière',field('Nom','name','text',`maxlength="100" value="${esc(s.name)}"`),d=>{const old=s.name;s.name=d.name.trim();state.tasks.forEach(t=>{if(t.subject===old)t.subject=s.name});state.focusSessions.forEach(t=>{if(t.subject===old)t.subject=s.name});if(state.focusSettings.subject===old)state.focusSettings.subject=s.name;if(focusRun.subject===old)focusRun.subject=s.name})}
 const chapter=e.target.closest('[data-rename-chapter]');if(chapter){const c=allChapters().find(c=>c.id===chapter.dataset.renameChapter);openModal('Renommer le chapitre',field('Nom','name','text',`maxlength="150" value="${esc(c.name)}"`),d=>c.name=d.name.trim())}
 if(e.target.closest('[data-calendar-task]')){taskEditor();document.querySelector('#modalForm').elements.date.value=selectedDay}
 const preset=e.target.closest('[data-focus-preset]');if(preset&&!preset.disabled){state.focusSettings.work=Number(preset.dataset.focusPreset);focusRun.mode='work';focusRun.duration=focusRun.left=state.focusSettings.work*60;persistFocus();render()}
 if(e.target.closest('[data-focus-reset]')&&confirm('Réinitialiser le chrono ? Le temps déjà étudié sera enregistré.')){settleFocus();finishFocus();render()}
 const range=e.target.closest('[data-progress-range]');if(range){progressRange=range.dataset.progressRange;render()}
 if(e.target.closest('[data-account-logout]'))window.PrepagoAccount?.signOut();
 const finished=e.target.closest('[data-chapter-finish]');if(finished){const c=allChapters().find(c=>c.id===finished.dataset.chapterId);if(c){c.completedAt=c.done?todayISO():null;save()}}
});
document.addEventListener('input',e=>{if(e.target.id==='sessionObjective'){state.focusSettings.objective=e.target.value;focusRun.objective=e.target.value;persistFocus()}});
// Score input must not silently store values outside /20.
document.addEventListener('input',e=>{if(e.target.id==='paperScore'){const p=getPaper(cncView.filiere,cncView.subject,cncView.year);if(!e.target.checkValidity()){p.score='';e.target.setAttribute('aria-invalid','true');showToast('La note doit être comprise entre 0 et 20.')}else e.target.removeAttribute('aria-invalid');save()}});
setInterval(()=>{if(!document.body.classList.contains('auth-pending')&&['overview','progress'].includes(currentPage)&&focusRun.running&&document.querySelector('#modalBackdrop').hidden)render()},15000);
render();
