// Prepago's shared study workspace. Existing storage keys and learning records are retained.
pageNames.overview='Aujourd’hui';pageNames.tasks='Tâches';pageNames.progress='Progression';
document.querySelectorAll('.brand').forEach(el=>el.innerHTML='prepago');
document.querySelectorAll('.nav-item').forEach(el=>{el.innerHTML=`<span class="icon"></span>${el.dataset.page==='overview'?'Vue d’ensemble':pageNames[el.dataset.page]}`});
const iconFiles={overview:'house',subjects:'book-open',tasks:'square-check',calendar:'calendar-days',focus:'timer',progress:'chart-no-axes-column-increasing',bolt:'zap',shield:'chart-no-axes-column-increasing',close:'x',plus:'plus',left:'chevron-left',right:'arrow-right',play:'play',pause:'pause',menu:'menu',cnc:'files',note:'notebook-pen',check:'check',link:'link',math:'sigma'};
uiIcon=function(name){return `<img class="icon-svg" src="icons/${iconFiles[name]||'book-open'}.svg" alt="" aria-hidden="true">`};
let taskView='all';
header=function(title,subtitle,action=''){return `<div class="section-head"><div><h1>${esc(title)}</h1>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${action}</div>`};
function subjectBadge(name){const s=state.subjects.find(s=>s.name===name);return name?`<span class="subject-label" style="--subject-color:${s?.color||'#1356de'}">${esc(name)}</span>`:''}
function taskRow(t,editable=false){return `<div class="desk-task ${t.done?'is-done':''}"><input type="checkbox" data-task="${esc(t.id)}" ${t.done?'checked':''} aria-label="Terminer : ${esc(t.title)}"><div class="task-copy"><strong>${esc(t.title)}</strong><div class="task-meta">${subjectBadge(t.subject)}${editable?`<span>${formatShort(t.date)}${t.time?' · '+esc(t.time):''}</span>`:''}${!t.done&&t.date<todayISO()?'<span class="overdue">En retard</span>':''}</div></div>${t.minutes?`<span class="task-duration">≈ ${Number(t.minutes)} min</span>`:''}${editable?`<button class="link-btn" data-task-edit="${esc(t.id)}">Modifier</button><button class="icon-btn" data-task-remove="${esc(t.id)}" aria-label="Supprimer : ${esc(t.title)}">${uiIcon('close')}</button>`:''}</div>`}
function miniCalendar(){const y=calendarDate.getFullYear(),m=calendarDate.getMonth(),offset=(new Date(y,m,1).getDay()+6)%7;const count=Math.ceil((offset+new Date(y,m+1,0).getDate())/7)*7;return `<div class="mini-calendar-head"><h2>${new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(calendarDate)}</h2><div><button class="icon-btn" data-month="-1" aria-label="Mois précédent">${uiIcon('left')}</button><button class="icon-btn" data-month="1" aria-label="Mois suivant">${uiIcon('right')}</button></div></div><div class="mini-calendar">${['L','Ma','Me','J','V','S','D'].map(d=>`<span class="mini-weekday">${d}</span>`).join('')}${Array.from({length:count},(_,i)=>{const d=new Date(y,m,i-offset+1),iso=localISO(d);return `<button class="mini-date ${d.getMonth()!==m?'outside':''} ${iso===todayISO()?'today':''} ${iso===selectedDay?'picked':''}" data-day="${iso}" aria-label="${formatDate(d)}" aria-pressed="${iso===selectedDay}">${d.getDate()}${calendarItems(iso).length?'<i></i>':''}</button>`}).join('')}</div>`}
function nextStudy(){ensureLearningModel();let pair;const last=state.lastStudy;if(last){const s=state.subjects.find(s=>s.id===last.subject);const c=s?.chapters.find(c=>c.id===last.chapter&&!c.done);if(c)pair={s,c}}if(!pair)for(const s of state.subjects){const c=s.chapters.find(c=>!c.done);if(c){pair={s,c};break}}return pair}
renderOverview=function(){const next=nextStudy();const daily=state.tasks.filter(t=>t.date<=todayISO()&&!t.done||t.date===todayISO()&&t.done).sort((a,b)=>Number(a.done)-Number(b.done)||a.date.localeCompare(b.date));const agenda=state.events.filter(e=>e.date===selectedDay).sort((a,b)=>(a.time||'').localeCompare(b.time||''));document.querySelector('#page').innerHTML=`<div class="desk-layout"><div class="desk-main"><header class="desk-heading"><p>${formatDate()} ${new Date().getFullYear()}</p><h1>Aujourd’hui</h1></header><section class="next-study"><h2>Prochaine étape d’étude</h2>${next?`<div class="study-block"><div class="study-emblem">${uiIcon(next.s.name.toLowerCase().includes('math')?'math':'subjects')}</div><div><p class="study-subject">${esc(next.s.name)}</p><h3>${esc(next.c.name)}</h3><p class="next-label">Étape suivante : <span>${LEARNING_STEPS.find(s=>!next.c.steps?.[s.key])?.label||'Valider le chapitre'}</span></p><p class="study-hint">${chapterUnits(next.c)} sur 5 étapes validées dans ce chapitre.</p><div class="resume-row"><button class="primary-btn resume-btn" data-resume-subject="${next.s.id}" data-resume-chapter="${next.c.id}">Reprendre ${uiIcon('right')}</button><p>${next.s.chapters.length} chapitres<br>${next.s.chapters.filter(c=>c.done).length} validés</p></div></div></div>`:`<div class="desk-empty"><h3>${state.subjects.length?'Votre programme est à jour.':'Construisez votre programme.'}</h3><p>Ajoutez un chapitre pour commencer une nouvelle étape.</p><button class="primary-btn" data-go="subjects">Mes matières</button></div>`}</section><section class="daily-tasks"><div class="desk-section-title"><h2>Mes tâches du jour</h2><button class="link-btn" data-task-new>+ Ajouter</button></div>${daily.length?daily.map(t=>taskRow(t)).join(''):`<div class="desk-empty"><h3>Une journée à organiser</h3><p>Ajoutez votre première tâche de révision.</p><button class="secondary-btn" data-task-new>Ajouter une tâche</button></div>`}</section></div><aside class="desk-rail"><section class="desk-calendar">${miniCalendar()}</section><section class="desk-focus"><div class="desk-section-title"><h2>Session de concentration</h2></div><div class="desk-clock-row"><strong id="deskClock">${timeText(Math.ceil(focusRun.left))}</strong><button class="link-btn" data-go="focus">Personnaliser</button></div><button class="primary-btn" data-focus-action="toggle">${focusRun.running?'Mettre en pause':focusRun.left<focusRun.duration?'Reprendre':'Démarrer'}</button>${focusRun.running?'<p class="running-note">Session en cours · vous pouvez changer de page.</p>':''}</section><section class="desk-agenda"><div class="desk-section-title"><h2>${selectedDay===todayISO()?'Aujourd’hui':formatShort(selectedDay)}</h2><button class="link-btn" data-go="calendar">Voir le calendrier ${uiIcon('right')}</button></div>${agenda.map(e=>`<button class="desk-event" data-edit-event="${esc(e.id)}"><small>${esc(e.time||'Toute la journée')}</small><strong>${esc(e.title)}</strong></button>`).join('')||'<p class="helper">Aucun autre événement</p>'}<button class="link-btn" data-new-event>+ Planifier un créneau</button></section></aside></div>`;refreshIcons()};
function dashboardTaskRow(task){
 const subject=task.subject?`<span>${esc(task.subject)}</span>`:'';
 const duration=task.minutes?`<span>≈ ${Number(task.minutes)} min</span>`:'';
 return `<label class="dashboard-task ${task.done?'is-done':''}"><input type="checkbox" data-task="${esc(task.id)}" ${task.done?'checked':''} aria-label="Terminer : ${esc(task.title)}"><span class="dashboard-task-copy"><strong>${esc(task.title)}</strong><small>${subject}${duration}</small></span></label>`;
}
function dashboardEventRow(event){
 const date=new Date(`${event.date}T12:00:00`);
 const day=new Intl.DateTimeFormat('fr-FR',{day:'2-digit'}).format(date);
 const month=new Intl.DateTimeFormat('fr-FR',{month:'short'}).format(date).replace('.','');
 return `<button class="dashboard-event" data-edit-event="${esc(event.id)}"><span class="dashboard-event-date"><strong>${day}</strong><small>${month}</small></span><span class="dashboard-event-copy"><strong>${esc(event.title)}</strong><small>${esc(event.time||'Toute la journée')}</small></span>${uiIcon('right')}</button>`;
}
renderOverview=function(){
 const next=nextStudy();
 const todayTasks=state.tasks.filter(task=>task.date===todayISO()).sort((a,b)=>Number(a.done)-Number(b.done)||(a.time||'').localeCompare(b.time||''));
 const upcomingEvents=state.events.filter(event=>event.date>=todayISO()).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'')).slice(0,5);
 const profile=state.profileName&&state.profileName!=='Préparationnaire'?state.profileName:'Lucas';
 const firstName=profile.trim().split(/\s+/)[0];
 document.querySelector('#page').innerHTML=`<div class="desk-layout dashboard-layout"><div class="desk-main"><header class="desk-heading dashboard-heading"><p>${formatDate()} ${new Date().getFullYear()}</p><h1>Bonjour, ${esc(firstName)}</h1><span>Prêt à avancer dans votre préparation ?</span></header><section class="next-study"><h2>Prochaine étape d’étude</h2>${next?`<div class="study-block"><div class="study-emblem">${uiIcon(next.s.name.toLowerCase().includes('math')?'math':'subjects')}</div><div><p class="study-subject">${esc(next.s.name)}</p><h3>${esc(next.c.name)}</h3><p class="next-label">Étape suivante : <span>${LEARNING_STEPS.find(step=>!next.c.steps?.[step.key])?.label||'Valider le chapitre'}</span></p><p class="study-hint">${chapterUnits(next.c)} sur 5 étapes validées dans ce chapitre.</p><div class="resume-row"><button class="primary-btn resume-btn" data-resume-subject="${next.s.id}" data-resume-chapter="${next.c.id}">Reprendre ${uiIcon('right')}</button><p>${next.s.chapters.length} chapitres<br>${next.s.chapters.filter(chapter=>chapter.done).length} validés</p></div></div></div>`:`<div class="desk-empty"><h3>${state.subjects.length?'Votre programme est à jour.':'Construisez votre programme.'}</h3><p>Ajoutez un chapitre pour commencer une nouvelle étape.</p><button class="primary-btn" data-go="subjects">Mes matières</button></div>`}</section></div><aside class="desk-rail day-rail"><section class="dashboard-panel dashboard-tasks"><div class="dashboard-panel-head"><div><span class="dashboard-panel-kicker">AUJOURD’HUI</span><h2>Mes tâches <small>${todayTasks.length}</small></h2></div><button class="link-btn" data-go="tasks">Tout voir ${uiIcon('right')}</button></div><div class="dashboard-panel-list">${todayTasks.length?todayTasks.slice(0,5).map(dashboardTaskRow).join(''):`<div class="dashboard-panel-empty"><p>Aucune tâche prévue aujourd’hui.</p><button class="link-btn" data-task-new>+ Ajouter une tâche</button></div>`}</div>${todayTasks.length?'<button class="dashboard-add" data-task-new>+ Ajouter une tâche</button>':''}</section><section class="dashboard-panel dashboard-events"><div class="dashboard-panel-head"><div><span class="dashboard-panel-kicker">PLANNING</span><h2>Événements à venir</h2></div><button class="link-btn" data-go="calendar">Calendrier ${uiIcon('right')}</button></div><div class="dashboard-panel-list">${upcomingEvents.length?upcomingEvents.map(dashboardEventRow).join(''):`<div class="dashboard-panel-empty"><p>Aucun événement à venir.</p><button class="link-btn" data-new-event>+ Planifier un événement</button></div>`}</div>${upcomingEvents.length?'<button class="dashboard-add" data-new-event>+ Planifier un événement</button>':''}</section></aside></div>`;
 refreshIcons();
};

renderTasks=function(){let tasks=[...state.tasks].sort((a,b)=>Number(a.done)-Number(b.done)||a.date.localeCompare(b.date));if(taskView==='today')tasks=tasks.filter(t=>t.date===todayISO());if(taskView==='open')tasks=tasks.filter(t=>!t.done);if(taskView==='done')tasks=tasks.filter(t=>t.done);document.querySelector('#page').innerHTML=header('Mes tâches','Une liste claire pour avancer chaque jour.',`<button class="primary-btn" data-task-new>+ Nouvelle tâche</button>`)+`<div class="view-tabs">${[['all','Toutes'],['today','Aujourd’hui'],['open','À faire'],['done','Terminées']].map(([v,l])=>`<button data-task-view="${v}" class="${taskView===v?'active':''}" aria-pressed="${taskView===v}">${l}</button>`).join('')}</div><section class="task-surface">${tasks.map(t=>taskRow(t,true)).join('')||'<div class="desk-empty"><h3>Aucune tâche ici</h3><p>Vos tâches apparaîtront dans cette liste.</p></div>'}</section>`};

let dashboardChartRange='week';
function focusMinutesOn(date){
 const recorded=state.focusSessions.filter(session=>session.date===date).reduce((sum,session)=>sum+Number(session.minutes||0),0);
 const running=date===todayISO()&&focusRun.mode==='work'?(focusRun.segments[date]||0)/60:0;
 return recorded+running;
}
function dashboardPeriodDates(range){
 const now=new Date();
 if(range==='month')return Array.from({length:new Date(now.getFullYear(),now.getMonth()+1,0).getDate()},(_,index)=>localISO(new Date(now.getFullYear(),now.getMonth(),index+1)));
 const monday=new Date(now);monday.setDate(now.getDate()-((now.getDay()+6)%7));
 return Array.from({length:7},(_,index)=>{const date=new Date(monday);date.setDate(monday.getDate()+index);return localISO(date)});
}
function dashboardStudyChart(){
 const dates=dashboardPeriodDates(dashboardChartRange);
 const values=dates.map(date=>focusMinutesOn(date));
 const max=Math.max(...values,60);
 const total=values.reduce((sum,value)=>sum+value,0);
 const bars=dates.map((date,index)=>{const day=new Date(`${date}T12:00:00`);const label=dashboardChartRange==='week'?new Intl.DateTimeFormat('fr-FR',{weekday:'short'}).format(day).replace('.',''):String(day.getDate());const height=Math.max(3,values[index]/max*100);return `<div class="study-chart-day ${date===todayISO()?'is-today':''}"><span>${values[index]?`${Math.round(values[index])}m`:''}</span><div class="study-chart-track"><i style="height:${height}%" title="${formatDate(day)} : ${Math.round(values[index])} minutes"></i></div><small>${label}</small></div>`}).join('');
 return `<section class="dashboard-study-chart"><div class="study-chart-head"><div><span class="dashboard-panel-kicker">TEMPS D’ÉTUDE</span><h2>${studyHours(total*60)} <small>${dashboardChartRange==='week'?'cette semaine':'ce mois'}</small></h2></div><div class="study-chart-actions"><div class="chart-range" aria-label="Période du graphique"><button class="${dashboardChartRange==='week'?'active':''}" data-chart-range="week" aria-pressed="${dashboardChartRange==='week'}">Semaine</button><button class="${dashboardChartRange==='month'?'active':''}" data-chart-range="month" aria-pressed="${dashboardChartRange==='month'}">Mois</button></div><button class="link-btn" data-go="focus">Concentration ${uiIcon('right')}</button></div></div><div class="study-chart-grid ${dashboardChartRange==='month'?'is-month':''}">${bars}</div></section>`;
}
function dashboardMetric(icon,label,value,caption,page){return `<button class="dashboard-metric" data-go="${page}"><span class="dashboard-metric-icon">${uiIcon(icon)}</span><span><small>${label}</small><strong>${value}</strong><em>${caption}</em></span></button>`}
renderOverview=function(){
 const todayTasks=state.tasks.filter(task=>task.date===todayISO()).sort((a,b)=>Number(a.done)-Number(b.done)||(a.time||'').localeCompare(b.time||''));
 const completedToday=todayTasks.filter(task=>task.done).length;
 const upcomingEvents=state.events.filter(event=>event.date>=todayISO()).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'')).slice(0,5);
 const weekMinutes=dashboardPeriodDates('week').reduce((sum,date)=>sum+focusMinutesOn(date),0);
 const todayMinutes=focusMinutesOn(todayISO());
 const profile=state.profileName&&state.profileName!=='Préparationnaire'?state.profileName:'Lucas';
 const firstName=profile.trim().split(/\s+/)[0];
 const metrics=`<section class="dashboard-metrics">${dashboardMetric('check','Tâches aujourd’hui',`${completedToday}/${todayTasks.length}`,todayTasks.length?'terminées':'aucune tâche','tasks')}${dashboardMetric('calendar','Étude cette semaine',studyHours(weekMinutes*60),'temps enregistré','focus')}${dashboardMetric('focus','Étude aujourd’hui',studyHours(todayMinutes*60),'sessions focus','focus')}${dashboardMetric('progress','Progression',`${progressPercent()}%`,'programme maîtrisé','progress')}</section>`;
 document.querySelector('#page').innerHTML=`<div class="desk-layout dashboard-layout"><div class="desk-main"><header class="desk-heading dashboard-heading"><p>${formatDate()} ${new Date().getFullYear()}</p><h1>Bonjour, ${esc(firstName)}</h1><span>Voici votre rythme de travail en un coup d’œil.</span></header>${dashboardStudyChart()}${metrics}</div><aside class="desk-rail day-rail"><section class="dashboard-panel dashboard-tasks"><div class="dashboard-panel-head"><div><span class="dashboard-panel-kicker">AUJOURD’HUI</span><h2>Mes tâches <small>${todayTasks.length}</small></h2></div><button class="link-btn" data-go="tasks">Tout voir ${uiIcon('right')}</button></div><div class="dashboard-panel-list">${todayTasks.length?todayTasks.slice(0,5).map(dashboardTaskRow).join(''):`<div class="dashboard-panel-empty"><p>Aucune tâche prévue aujourd’hui.</p><button class="link-btn" data-task-new>+ Ajouter une tâche</button></div>`}</div>${todayTasks.length?'<button class="dashboard-add" data-task-new>+ Ajouter une tâche</button>':''}</section><section class="dashboard-panel dashboard-events"><div class="dashboard-panel-head"><div><span class="dashboard-panel-kicker">PLANNING</span><h2>Événements à venir</h2></div><button class="link-btn" data-go="calendar">Calendrier ${uiIcon('right')}</button></div><div class="dashboard-panel-list">${upcomingEvents.length?upcomingEvents.map(dashboardEventRow).join(''):`<div class="dashboard-panel-empty"><p>Aucun événement à venir.</p><button class="link-btn" data-new-event>+ Planifier un événement</button></div>`}</div>${upcomingEvents.length?'<button class="dashboard-add" data-new-event>+ Planifier un événement</button>':''}</section></aside></div>`;
 refreshIcons();
};

function taskEditor(id){const t=state.tasks.find(t=>t.id===id)||{title:'',date:todayISO(),time:'',subject:'',priority:'medium',minutes:30};openModal(id?'Modifier la tâche':'Nouvelle tâche',field('Titre','title','text',`maxlength="180" value="${esc(t.title)}"`)+`<div class="settings-grid">${field('Date','date','date',`value="${esc(t.date)}"`)}${field('Durée estimée (min)','minutes','number',`min="1" max="600" value="${Number(t.minutes)||30}"`)}</div>`+field('Heure (facultative)','time','time',`value="${esc(t.time||'')}"`)+`<div class="field"><label for="subject">Matière</label><select name="subject" id="subject">${subjectOptions()}</select></div><div class="field"><label for="priority">Priorité</label><select name="priority" id="priority"><option value="high">Prioritaire</option><option value="medium">Normale</option><option value="low">Flexible</option></select></div>`,d=>{d.minutes=Number(d.minutes);if(id)Object.assign(t,d);else state.tasks.push({id:uid('t'),...d,done:false})});const f=document.querySelector('#modalForm');f.elements.time.required=false;f.elements.subject.value=t.subject;f.elements.priority.value=t.priority}
const hubBeforeRedesign=renderSubjectHub;
renderSubjects=function(){hubBeforeRedesign();document.querySelectorAll('.subject-symbol').forEach(n=>n.innerHTML=uiIcon(n.textContent.includes('∑')?'math':'subjects'));const summary=document.querySelector('.mastery-summary');if(summary)summary.innerHTML=`<p>${state.subjects.length} matières <span>·</span> ${allChapters().length} chapitres <span>·</span> ${doneChapters()} maîtrisés</p>`;document.querySelectorAll('.chapter-mastery-card').forEach((el,i)=>{const s=state.subjects.find(s=>s.id===learningSubjectId),c=s.chapters[i];el.dataset.chapterCard=c.id;el.insertAdjacentHTML('beforeend',`<details class="chapter-notes"><summary>Notes & ressource</summary><label>Mes notes<textarea data-chapter-notes="${c.id}" data-sid="${s.id}" placeholder="Méthodes, erreurs à revoir, questions…">${esc(c.notes||'')}</textarea></label><label>Lien du cours ou des exercices<input type="url" data-chapter-resource="${c.id}" data-sid="${s.id}" value="${esc(c.resource||'')}" placeholder="https://…"></label>${/^https?:\/\//i.test(c.resource||'')?`<a href="${esc(c.resource)}" target="_blank" rel="noopener">Ouvrir la ressource</a>`:''}<small>Enregistrement automatique</small></details>`)});refreshIcons()};
const renderPrevious=render;
render=function(){document.body.dataset.page=currentPage;renderPrevious();document.querySelectorAll('.nav-item').forEach(n=>{if(n.dataset.page===currentPage)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current')})};
const previousFocusDisplay=updateFocusDisplay;
updateFocusDisplay=function(){previousFocusDisplay();const el=document.querySelector('#deskClock');if(el)el.textContent=timeText(Math.ceil(focusRun.left))};
const previousFinishFocus=finishFocus;
finishFocus=function(){previousFinishFocus();if(currentPage==='overview')render()};
document.addEventListener('click',e=>{const resume=e.target.closest('[data-resume-subject]');if(resume){currentPage='subjects';learningSubjectId=resume.dataset.resumeSubject;state.lastStudy={subject:learningSubjectId,chapter:resume.dataset.resumeChapter};save();document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page==='subjects'));render();document.querySelector(`[data-chapter-card="${resume.dataset.resumeChapter}"]`)?.scrollIntoView({block:'center',behavior:'smooth'})}if(e.target.closest('[data-task-new]'))taskEditor();const edit=e.target.closest('[data-task-edit]');if(edit)taskEditor(edit.dataset.taskEdit);const remove=e.target.closest('[data-task-remove]');if(remove&&confirm('Supprimer cette tâche ?')){const t=state.tasks.find(t=>t.id===remove.dataset.taskRemove);if(t?.done)state.xp=Math.max(0,state.xp-25);state.tasks=state.tasks.filter(t=>t.id!==remove.dataset.taskRemove);save();render()}const filter=e.target.closest('[data-task-view]');if(filter){taskView=filter.dataset.taskView;render()}const step=e.target.closest('[data-learning-step]');if(step){state.lastStudy={subject:step.dataset.subjectId,chapter:step.dataset.chapterId};save()}if(e.target.closest('#menuBtn'))document.querySelector('#menuBtn').setAttribute('aria-expanded',document.querySelector('#sidebar').classList.contains('open'))});
document.addEventListener('input',e=>{const el=e.target;if(el.matches('[data-chapter-notes],[data-chapter-resource]')){const c=state.subjects.find(s=>s.id===el.dataset.sid)?.chapters.find(c=>c.id===(el.dataset.chapterNotes||el.dataset.chapterResource));if(c){c[el.dataset.chapterNotes?'notes':'resource']=el.value;save()}}});
document.addEventListener('change',e=>{if(e.target.matches('[data-chapter-resource]'))render()});
document.addEventListener('click',event=>{
 const range=event.target.closest('[data-chart-range]');
 if(!range)return;
 dashboardChartRange=range.dataset.chartRange;
 if(currentPage==='overview')render();
});
// Keep keyboard focus inside the active dialog and restore it on close.
let modalOpener;const baseOpenModal=openModal,baseCloseModal=closeModal;
openModal=function(...args){modalOpener=document.activeElement;baseOpenModal(...args)};
closeModal=function(){baseCloseModal();modalOpener?.focus()};
document.addEventListener('keydown',e=>{const back=document.querySelector('#modalBackdrop');if(e.key==='Tab'&&!back.hidden){const items=[...back.querySelectorAll('button,input,select,textarea,a[href]')].filter(n=>!n.disabled);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
render();
renderProgress=function(){const days=last7Days().map(date=>({date,minutes:state.focusSessions.filter(s=>s.date===date).reduce((a,s)=>a+s.minutes,0)}));const max=Math.max(...days.map(d=>d.minutes),30);document.querySelector('#page').innerHTML=header('Ma progression','Votre travail, jour après jour.')+`<div class="progress-overview"><div><strong>${state.xp}</strong><span>XP au total · niveau ${level()}</span></div><div><strong>${doneChapters()} / ${allChapters().length}</strong><span>Chapitres maîtrisés</span></div><div><strong>${completedTasks()}</strong><span>Tâches terminées</span></div><div><strong>${studyHours(state.focusSessions.reduce((a,s)=>a+s.minutes*60,0))}</strong><span>Temps étudié</span></div></div><div class="progress-columns"><section><h2>Les 7 derniers jours</h2><div class="work-chart">${days.map(d=>`<div class="work-day"><span>${Math.floor(d.minutes)} min</span><div class="work-bar" style="height:${Math.max(2,d.minutes/max*160)}px" title="${formatShort(d.date)} : ${Math.floor(d.minutes)} minutes"></div><small>${new Intl.DateTimeFormat('fr-FR',{weekday:'short'}).format(new Date(d.date+'T12:00:00'))}</small></div>`).join('')}</div><p class="progress-note">Temps des sessions enregistrées, hors pauses.</p></section><section><h2>Maîtrise par matière</h2>${state.subjects.map(s=>`<div class="mastery-progress-row"><div><strong>${esc(s.name)}</strong><span>${subjectMastery(s)} %</span></div><div class="progress-bar"><div class="progress-fill" style="width:${subjectMastery(s)}%"></div></div></div>`).join('')||'<p class="helper">Ajoutez votre première matière.</p>'}<p class="progress-note">${500-state.xp%500} XP avant le niveau ${level()+1}.</p></section></div>`};
render();
function syncMobileMenu(){const sidebar=document.querySelector('#sidebar');const mobile=matchMedia('(max-width:820px)').matches;sidebar.inert=mobile&&!sidebar.classList.contains('open');document.querySelector('#menuBtn').setAttribute('aria-expanded',sidebar.classList.contains('open'))}
window.addEventListener('resize',syncMobileMenu);
document.addEventListener('click',e=>{const sidebar=document.querySelector('#sidebar');if(sidebar.classList.contains('open')&&!e.target.closest('#sidebar,#menuBtn'))sidebar.classList.remove('open');syncMobileMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelector('#sidebar').classList.remove('open');syncMobileMenu()}});
syncMobileMenu();

// Sidebar progression mirrors the compact reference layout.
const updateSidebarBase=updateSidebar;
updateSidebar=function(){
 updateSidebarBase();
 const withinLevel=state.xp%500;
 const fill=document.querySelector('#sideXpFill');
 const ratio=document.querySelector('#sideXpRatio');
 const name=document.querySelector('#sideProfileName');
 const avatar=document.querySelector('.sidebar-avatar');
 if(fill)fill.style.width=`${withinLevel/5}%`;
 if(ratio)ratio.textContent=`${Math.round(withinLevel/5)} / 100`;
 const profile=state.profileName&&state.profileName!=='Préparationnaire'?state.profileName:'Lucas';
 if(name)name.textContent=profile;
 if(avatar)avatar.textContent=profile.split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase();
 const topName=document.querySelector('#topbarProfileName');
 const topAvatar=document.querySelector('#topbarAvatar');
 if(topName)topName.textContent=profile.split(/\s+/)[0];
 if(topAvatar)topAvatar.textContent=profile[0].toUpperCase();
};
updateSidebar();

const topbarDate=document.querySelector('#topbarDate');
if(topbarDate){
 const now=new Date();
 topbarDate.dateTime=localISO(now);
 topbarDate.textContent=`${formatDate(now)} ${now.getFullYear()}`;
}

const topSearch=document.querySelector('#topSearch');
const topSearchResults=document.querySelector('#topSearchResults');
function searchStudyContent(query){
 const value=query.trim().toLocaleLowerCase('fr');
 if(!value)return [];
 return state.subjects.flatMap(subject=>{
  const subjectMatch=subject.name.toLocaleLowerCase('fr').includes(value)?[{subject,chapter:null}]:[];
  const chapters=(subject.chapters||[]).filter(chapter=>chapter.name.toLocaleLowerCase('fr').includes(value)).map(chapter=>({subject,chapter}));
  return [...subjectMatch,...chapters];
 }).slice(0,6);
}
function showSearchResults(){
 const results=searchStudyContent(topSearch.value);
 if(!topSearch.value.trim()){topSearchResults.hidden=true;return}
 topSearchResults.innerHTML=results.length?results.map(({subject,chapter})=>`<button type="button" data-search-subject="${subject.id}" ${chapter?`data-search-chapter="${chapter.id}"`:''}><span>${uiIcon(chapter?'note':'subjects')}</span><span><strong>${esc(chapter?.name||subject.name)}</strong>${chapter?`<small>${esc(subject.name)}</small>`:'<small>Matière</small>'}</span></button>`).join(''):'<p>Aucun résultat</p>';
 topSearchResults.hidden=false;
}
topSearch?.addEventListener('input',showSearchResults);
topSearch?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();topSearchResults.querySelector('button')?.click()}if(event.key==='Escape'){topSearchResults.hidden=true;topSearch.blur()}});

document.addEventListener('click',event=>{
 const result=event.target.closest('[data-search-subject]');
 if(result){
  currentPage='subjects';learningSubjectId=result.dataset.searchSubject;
  if(result.dataset.searchChapter)state.lastStudy={subject:learningSubjectId,chapter:result.dataset.searchChapter};
  document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.page==='subjects'));
  topSearchResults.hidden=true;topSearch.value='';render();
  if(result.dataset.searchChapter)document.querySelector(`[data-chapter-card="${result.dataset.searchChapter}"]`)?.scrollIntoView({block:'center',behavior:'smooth'});
  return;
 }
 const notificationButton=event.target.closest('#notificationBtn');
 const notificationPanel=document.querySelector('#notificationPanel');
 if(notificationButton){const opening=notificationPanel.hidden;notificationPanel.hidden=!opening;notificationButton.setAttribute('aria-expanded',opening);return}
 if(!event.target.closest('.notification-wrap')){notificationPanel.hidden=true;document.querySelector('#notificationBtn')?.setAttribute('aria-expanded','false')}
 if(!event.target.closest('.topbar-search'))topSearchResults.hidden=true;
 const trigger=event.target.closest('[data-action="profile"]');
 if(!trigger)return;
 const profile=state.profileName&&state.profileName!=='Préparationnaire'?state.profileName:'Lucas';
 openModal('Profil étudiant',field('Nom complet','name','text',`value="${esc(profile)}"`),data=>{state.profileName=data.name.trim()||'Lucas'});
});
