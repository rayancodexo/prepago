const STORAGE_KEY = 'prepaflow-v2';
const COLORS = ['#6558df','#3b82f6','#f59e0b','#22a06b','#ec4899','#8b5cf6'];
const defaultState = {
  subjects:[
    {id:'s1',name:'Mathématiques',symbol:'∑',color:'#6558df',chapters:[{id:'c1',name:'Algèbre linéaire',done:false},{id:'c2',name:'Analyse',done:false},{id:'c3',name:'Probabilités',done:false}]},
    {id:'s2',name:'Physique',symbol:'⚛',color:'#3b82f6',chapters:[{id:'c4',name:'Mécanique',done:false},{id:'c5',name:'Électromagnétisme',done:false},{id:'c6',name:'Thermodynamique',done:false}]},
    {id:'s3',name:'Sciences industrielles',symbol:'⚙',color:'#f59e0b',chapters:[{id:'c7',name:'Automatique',done:false},{id:'c8',name:'Mécanique des systèmes',done:false}]}
  ],
  tasks:[], events:[], focusSessions:[], xp:0, profileName:'Préparationnaire'
};
let state = loadState();
let currentPage = 'overview';
let calendarDate = new Date();
let timer = {duration:25*60,left:25*60,running:false,interval:null};

function loadState(){try{return {...structuredClone(defaultState),...JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}}catch{return structuredClone(defaultState)}}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));updateSidebar()}
function uid(prefix){return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function esc(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function allChapters(){return state.subjects.flatMap(s=>s.chapters||[])}
function doneChapters(){return allChapters().filter(c=>c.done).length}
function completedTasks(){return state.tasks.filter(t=>t.done).length}
function level(){return Math.floor(state.xp/500)+1}
function levelProgress(){return state.xp%500/5}
function progressPercent(){const total=allChapters().length;return total?Math.round(doneChapters()/total*100):0}
function todayISO(){const d=new Date();return localISO(d)}
function localISO(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function formatDate(date=new Date()){return new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(date).replace(/^./,c=>c.toUpperCase())}
function formatShort(iso){return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short'}).format(new Date(iso+'T12:00:00'))}
function focusToday(){return state.focusSessions.filter(s=>s.date===todayISO()).reduce((a,s)=>a+s.minutes,0)}
function showToast(message){const t=document.querySelector('#toast');t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function updateSidebar(){document.querySelector('#sideLevel').textContent=`Niveau ${level()}`;document.querySelector('#sideXp').textContent=`${state.xp} XP au total`}

const pageNames={overview:'Vue d’ensemble',subjects:'Mes matières',tasks:'Tâches quotidiennes',focus:'Concentration',progress:'Ma progression'};
function navigate(page){currentPage=page;document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));document.querySelector('#breadcrumb').textContent=pageNames[page];document.querySelector('#sidebar').classList.remove('open');render()}
function render(){({overview:renderOverview,subjects:renderSubjects,tasks:renderTasks,focus:renderFocus,progress:renderProgress}[currentPage]||renderOverview)();updateSidebar()}

function header(title,subtitle,action=''){return `<div class="section-head"><div><span class="eyebrow">MON ESPACE PRÉPA</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`}
function renderOverview(){
  const total=allChapters().length, done=doneChapters(), p=progressPercent(), lev=level(), focus=focusToday();
  const subjects=state.subjects.slice(0,4).map(s=>{const d=s.chapters.filter(c=>c.done).length,t=s.chapters.length,sp=t?Math.round(d/t*100):0;return `<div class="subject-mini"><div class="subject-symbol" style="background:${s.color}18;color:${s.color}">${esc(s.symbol)}</div><div><h3>${esc(s.name)}</h3><p>${t} chapitre${t!==1?'s':''} · ${d} validé${d!==1?'s':''}</p><div class="progress-bar" style="margin-top:12px"><div class="progress-fill" style="width:${sp}%;background:${s.color}"></div></div></div><div class="subject-progress">${sp}%</div></div>`}).join('');
  document.querySelector('#page').innerHTML=`<span class="eyebrow">VOTRE TABLEAU DE BORD</span><div class="hero-row"><div><h1>Chaque jour, un peu plus loin.</h1><p>Gardez le cap sur votre prépa, une étape à la fois.</p></div><div class="date-pill">${formatDate()}</div></div>
  <div class="stats">
    <div class="card stat"><div class="stat-top"><span>Progression globale</span><span class="stat-icon">⌁</span></div><div class="stat-value">${p}<small> %</small></div><div class="progress-bar"><div class="progress-fill" style="width:${p}%"></div></div><div class="stat-foot">${done} étape${done!==1?'s':''} validée${done!==1?'s':''} sur ${total}</div></div>
    <div class="card stat"><div class="stat-top"><span>Expérience totale</span><span class="stat-icon">ϟ</span></div><div class="stat-value">${state.xp}<small> XP</small></div><div class="stat-foot">Gagnée avec vos révisions et vos tâches</div></div>
    <div class="card stat"><div class="stat-top"><span>Niveau actuel</span><span class="stat-icon">◇</span></div><div class="stat-value">${String(lev).padStart(2,'0')} <span class="tag">${lev<3?'Explorateur':lev<6?'Régulier':'Maître'}</span></div><div class="progress-bar"><div class="progress-fill" style="width:${levelProgress()}%"></div></div><div class="stat-foot">${500-state.xp%500} XP avant le prochain niveau</div></div>
    <div class="card stat"><div class="stat-top"><span>Focus aujourd’hui</span><span class="stat-icon">◷</span></div><div class="stat-value">${focus}<small> min</small></div><div class="stat-foot">${state.focusSessions.filter(s=>s.date===todayISO()).length} session${state.focusSessions.filter(s=>s.date===todayISO()).length!==1?'s':''} terminée${state.focusSessions.filter(s=>s.date===todayISO()).length!==1?'s':''}</div></div>
  </div>
  <div class="overview-grid"><section class="card program-card"><div class="card-head"><div><h2>Votre programme, en un regard</h2><p>L’avancement de vos matières.</p></div><button class="link-btn" data-go="subjects">Ouvrir les matières →</button></div>${subjects||emptyBlock('Aucune matière','Ajoutez votre première matière pour commencer.')}</section>
  <section class="card focus-promo"><div class="timer-symbol">◷</div><span class="eyebrow" style="margin-top:28px">UN MOMENT POUR AVANCER</span><h2>Moins de distractions.<br>Plus de concentration.</h2><p>Lancez une session de travail et gagnez 2 XP par minute.</p><button class="primary-btn" data-go="focus">Démarrer une session</button></section></div>`;
}

function emptyBlock(title,text){return `<div class="empty"><div class="empty-icon">＋</div><h3>${title}</h3><p>${text}</p></div>`}
function renderSubjects(){
  const cards=state.subjects.map(s=>{const done=s.chapters.filter(c=>c.done).length,total=s.chapters.length,p=total?Math.round(done/total*100):0;return `<article class="card subject-card"><div class="subject-color" style="background:${s.color}"></div><div class="card-head"><div><h3>${esc(s.symbol)} &nbsp;${esc(s.name)}</h3><p>${done}/${total} chapitres validés</p></div><button class="icon-btn" data-delete-subject="${s.id}" title="Supprimer">×</button></div><div class="progress-bar"><div class="progress-fill" style="width:${p}%;background:${s.color}"></div></div><div class="chapters">${s.chapters.map(c=>`<label class="chapter ${c.done?'done':''}"><input type="checkbox" data-chapter="${c.id}" data-subject="${s.id}" ${c.done?'checked':''}><span>${esc(c.name)}</span><button type="button" class="icon-btn" data-delete-chapter="${c.id}" data-subject="${s.id}">×</button></label>`).join('')||'<p style="color:var(--muted)">Aucun chapitre</p>'}</div><div class="card-actions"><button class="secondary-btn" data-add-chapter="${s.id}">+ Chapitre</button></div></article>`}).join('');
  document.querySelector('#page').innerHTML=header('Mes matières','Créez votre programme et validez vos chapitres.',`<div class="section-head-actions"><button class="primary-btn" id="addSubject">+ Ajouter une matière</button></div>`)+`<div class="subjects-grid">${cards||`<div class="card" style="grid-column:1/-1">${emptyBlock('Votre programme est vide','Ajoutez une matière puis ses chapitres.')}</div>`}</div>`;
}

function renderTasks(){
  const sorted=[...state.tasks].sort((a,b)=>Number(a.done)-Number(b.done)||a.date.localeCompare(b.date));
  const list=sorted.map(t=>`<div class="task-item ${t.done?'done':''}"><input class="task-check" type="checkbox" data-task="${t.id}" ${t.done?'checked':''}><div><h3>${esc(t.title)}</h3><p>${formatShort(t.date)}${t.subject?' · '+esc(t.subject):''}${t.time?' · '+esc(t.time):''}</p></div><span class="priority ${t.priority}">${{high:'Prioritaire',medium:'Normal',low:'Flexible'}[t.priority]}</span></div>`).join('');
  document.querySelector('#page').innerHTML=header('Tâches & planning','Planifiez votre journée et visualisez vos échéances.',`<div class="section-head-actions"><button class="secondary-btn" id="addEvent">+ Événement</button><button class="primary-btn" id="addTask">+ Nouvelle tâche</button></div>`)+`<div class="task-layout"><section class="card task-list">${list||emptyBlock('Aucune tâche','Ajoutez une tâche pour construire votre journée.')}</section><section class="card calendar-card">${calendarHTML()}<div class="planner-list"><h3>Planning du mois</h3>${eventsForMonth()}</div></section></div>`;
}
function calendarHTML(){const y=calendarDate.getFullYear(),m=calendarDate.getMonth(),first=new Date(y,m,1),last=new Date(y,m+1,0),start=(first.getDay()+6)%7;let days='';for(let i=0;i<start;i++)days+=`<div class="cal-day muted"></div>`;for(let d=1;d<=last.getDate();d++){const iso=localISO(new Date(y,m,d)),has=state.tasks.some(t=>t.date===iso)||state.events.some(e=>e.date===iso);days+=`<div class="cal-day ${has?'has':''} ${iso===todayISO()?'today':''}" title="${has?'Élément planifié':''}">${d}</div>`}return `<div class="calendar-head"><button class="calendar-nav-btn" data-cal="prev">‹</button><h2>${new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(first)}</h2><button class="calendar-nav-btn" data-cal="next">›</button></div><div class="calendar-grid">${['L','M','M','J','V','S','D'].map(x=>`<div class="cal-label">${x}</div>`).join('')}${days}</div>`}
function eventsForMonth(){const m=calendarDate.getMonth(),y=calendarDate.getFullYear();const events=state.events.filter(e=>{const d=new Date(e.date+'T12:00:00');return d.getMonth()===m&&d.getFullYear()===y}).sort((a,b)=>a.date.localeCompare(b.date));return events.map(e=>`<div class="planner-event" style="border-color:${e.color||'#6558df'}"><strong>${esc(e.title)}</strong><small>${formatShort(e.date)}${e.time?' · '+esc(e.time):''}</small></div>`).join('')||'<p style="color:var(--muted)">Aucun événement ce mois-ci.</p>'}

function renderFocus(){const pct=(1-timer.left/timer.duration)*100;document.querySelector('#page').innerHTML=header('Concentration','Une session à la fois. Chaque minute compte.')+`<div class="focus-shell"><section class="card focus-card"><span class="eyebrow">MODE FOCUS</span><div class="timer-ring" id="timerRing" style="--timer-progress:${pct}%"><div><div class="timer-display" id="timerDisplay">${timeText(timer.left)}</div><div class="timer-label">session de concentration</div></div></div><div class="duration-options">${[15,25,45,60].map(n=>`<button class="duration-btn ${timer.duration===n*60?'active':''}" data-duration="${n}">${n} min</button>`).join('')}</div><div class="timer-actions"><button class="secondary-btn" id="resetTimer">Réinitialiser</button><button class="primary-btn" id="toggleTimer">${timer.running?'Pause':'Démarrer'}</button></div></section></div>`}
function timeText(seconds){return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}
function startTimer(){if(timer.running)return;timer.running=true;document.querySelector('#toggleTimer').textContent='Pause';timer.interval=setInterval(()=>{timer.left--;updateTimerUI();if(timer.left<=0)completeFocus()},1000)}
function pauseTimer(){timer.running=false;clearInterval(timer.interval);timer.interval=null;const b=document.querySelector('#toggleTimer');if(b)b.textContent='Démarrer'}
function resetTimer(){pauseTimer();timer.left=timer.duration;updateTimerUI()}
function updateTimerUI(){const display=document.querySelector('#timerDisplay'),ring=document.querySelector('#timerRing');if(display)display.textContent=timeText(Math.max(timer.left,0));if(ring)ring.style.setProperty('--timer-progress',`${(1-timer.left/timer.duration)*100}%`)}
function completeFocus(){pauseTimer();const minutes=Math.round(timer.duration/60);state.focusSessions.push({id:uid('f'),date:todayISO(),minutes});state.xp+=minutes*2;save();showToast(`Session terminée : +${minutes*2} XP`);timer.left=timer.duration;renderFocus()}

function renderProgress(){
  const daily=last7Days().map(date=>({date,xp:state.tasks.filter(t=>t.done&&t.completedAt===date).length*25+state.focusSessions.filter(s=>s.date===date).reduce((a,s)=>a+s.minutes*2,0)}));const max=Math.max(...daily.map(d=>d.xp),50);
  document.querySelector('#page').innerHTML=header('Ma progression','Suivez votre régularité et votre montée en niveau.')+`<div class="progress-layout"><section class="card progress-card"><h2>Niveau & expérience</h2><div class="big-level"><div class="level-orb">${level()}</div><div><h3>${state.xp} XP</h3><p style="color:var(--muted)">${500-state.xp%500} XP avant le niveau ${level()+1}</p><div class="progress-bar" style="width:min(330px,100%)"><div class="progress-fill" style="width:${levelProgress()}%"></div></div></div></div></section><section class="card progress-card"><h2>Les 7 derniers jours</h2><div class="chart">${daily.map(d=>`<div class="bar-wrap"><div class="bar" style="height:${Math.max(4,d.xp/max*160)}px" title="${d.xp} XP"></div><small>${new Intl.DateTimeFormat('fr-FR',{weekday:'short'}).format(new Date(d.date+'T12:00:00')).slice(0,2)}</small></div>`).join('')}</div></section><section class="card progress-card"><h2>Résumé</h2><div class="stats" style="grid-template-columns:repeat(2,1fr)"><div><div class="stat-value">${doneChapters()}</div><span style="color:var(--muted)">Chapitres validés</span></div><div><div class="stat-value">${completedTasks()}</div><span style="color:var(--muted)">Tâches terminées</span></div><div><div class="stat-value">${state.focusSessions.length}</div><span style="color:var(--muted)">Sessions focus</span></div><div><div class="stat-value">${progressPercent()}%</div><span style="color:var(--muted)">Programme</span></div></div></section><section class="card progress-card"><h2>Réussites</h2><div class="achievement-list">${achievement('🌱','Premier pas','Terminer une première tâche',completedTasks()>=1)}${achievement('🔥','Bien lancé','Atteindre 250 XP',state.xp>=250)}${achievement('🏆','Programme solide','Valider 10 chapitres',doneChapters()>=10)}</div></section></div>`;
}
function last7Days(){return Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);return localISO(d)})}
function achievement(icon,title,text,unlocked){return `<div class="achievement ${unlocked?'':'locked'}"><span class="achievement-icon">${icon}</span><div><strong>${title}</strong><small>${unlocked?'Débloqué':text}</small></div></div>`}

function openModal(title,fields,onSubmit){const back=document.querySelector('#modalBackdrop'),form=document.querySelector('#modalForm');document.querySelector('#modalTitle').textContent=title;form.innerHTML=fields+`<div class="form-actions"><button type="button" class="secondary-btn" id="cancelModal">Annuler</button><button class="primary-btn" type="submit">Enregistrer</button></div>`;back.hidden=false;setTimeout(()=>form.querySelector('input,select,textarea')?.focus(),30);document.querySelector('#cancelModal').onclick=closeModal;form.onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(form));onSubmit(data);closeModal();save();render();showToast('Enregistré')};}
function closeModal(){document.querySelector('#modalBackdrop').hidden=true}
function field(label,name,type='text',extra=''){return `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" ${extra} required></div>`}
function subjectOptions(){return `<option value="">Aucune</option>${state.subjects.map(s=>`<option>${esc(s.name)}</option>`).join('')}`}

document.addEventListener('click',e=>{
  const go=e.target.closest('[data-go]');if(go)return navigate(go.dataset.go);
  const nav=e.target.closest('.nav-item');if(nav)return navigate(nav.dataset.page);
  if(e.target.id==='menuBtn')return document.querySelector('#sidebar').classList.toggle('open');
  if(e.target.id==='modalClose'||e.target.id==='modalBackdrop')return closeModal();
  if(e.target.id==='addSubject')return openModal('Ajouter une matière',field('Nom de la matière','name')+field('Symbole court','symbol','text','maxlength="2" placeholder="∑"')+`<div class="field"><label for="color">Couleur</label><input id="color" name="color" type="color" value="${COLORS[state.subjects.length%COLORS.length]}"></div>`,d=>state.subjects.push({id:uid('s'),name:d.name,symbol:d.symbol||'•',color:d.color,chapters:[]}));
  const addCh=e.target.closest('[data-add-chapter]');if(addCh)return openModal('Ajouter un chapitre',field('Nom du chapitre','name'),d=>state.subjects.find(s=>s.id===addCh.dataset.addChapter)?.chapters.push({id:uid('c'),name:d.name,done:false}));
  const delS=e.target.closest('[data-delete-subject]');if(delS&&confirm('Supprimer cette matière et tous ses chapitres ?')){state.subjects=state.subjects.filter(s=>s.id!==delS.dataset.deleteSubject);save();render()}
  const delC=e.target.closest('[data-delete-chapter]');if(delC){const s=state.subjects.find(s=>s.id===delC.dataset.subject);s.chapters=s.chapters.filter(c=>c.id!==delC.dataset.deleteChapter);save();render()}
  if(e.target.id==='addTask')return openModal('Nouvelle tâche',field('Titre','title')+field('Date','date','date',`value="${todayISO()}"`)+field('Heure','time','time')+`<div class="field"><label for="subject">Matière</label><select name="subject" id="subject">${subjectOptions()}</select></div><div class="field"><label for="priority">Priorité</label><select name="priority" id="priority"><option value="high">Prioritaire</option><option value="medium" selected>Normale</option><option value="low">Flexible</option></select></div>`,d=>state.tasks.push({id:uid('t'),...d,done:false}));
  if(e.target.id==='addEvent')return openModal('Ajouter au planning',field('Titre','title')+field('Date','date','date',`value="${todayISO()}"`)+field('Heure','time','time')+`<div class="field"><label for="color">Couleur</label><input id="color" name="color" type="color" value="#6558df"></div>`,d=>state.events.push({id:uid('e'),...d}));
  const cal=e.target.closest('[data-cal]');if(cal){calendarDate.setMonth(calendarDate.getMonth()+(cal.dataset.cal==='next'?1:-1));renderTasks()}
  const dur=e.target.closest('[data-duration]');if(dur&&!timer.running){timer.duration=Number(dur.dataset.duration)*60;timer.left=timer.duration;renderFocus()}
  if(e.target.id==='toggleTimer')return timer.running?pauseTimer():startTimer();
  if(e.target.id==='resetTimer')return resetTimer();
});
document.addEventListener('change',e=>{
  if(e.target.matches('[data-chapter]')){const s=state.subjects.find(s=>s.id===e.target.dataset.subject),c=s.chapters.find(c=>c.id===e.target.dataset.chapter);if(c){c.done=e.target.checked;state.xp=Math.max(0,state.xp+(c.done?50:-50));save();render();showToast(c.done?'+50 XP':'Chapitre rouvert')}}
  if(e.target.matches('[data-task]')){const t=state.tasks.find(t=>t.id===e.target.dataset.task);if(t){t.done=e.target.checked;t.completedAt=t.done?todayISO():null;state.xp=Math.max(0,state.xp+(t.done?25:-25));save();render();showToast(t.done?'+25 XP':'Tâche rouverte')}}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
document.querySelector('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal()});
updateSidebar();render();
