// Chapter mastery and CNC archives workspace. Data is stored with the existing PrépaFlow profile.
iconPaths.cnc='<path d="M7 3h8l4 4v14H7Z"/><path d="M15 3v5h5M10 12h6m-6 4h6M4 7H2v14h12"/>';
iconPaths.note='<path d="M5 3h14v18H5Z"/><path d="M8 8h8m-8 4h8m-8 4h5"/>';
iconPaths.check='<path d="m5 12 4 4L19 6"/>';
iconPaths.link='<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>';
pageNames.cnc='Annales CNC';

const LEARNING_STEPS=[
 {key:'course',label:'Cours',xp:10},
 {key:'summary',label:'Résumé',xp:15},
 {key:'easy',label:'Exercices faciles',xp:20},
 {key:'advanced',label:'Exercices avancés',xp:30}
];
const FULL_CHAPTER_XP=100;
function ensureLearningModel(){
 let changed=false,legacyFinished=0;
 state.subjects.forEach(subject=>{
  const organizationType=PrepagoSubjectOrganization.isPhysics(subject)?'physics':'standard';
  if(subject.organizationType!==organizationType){
   subject.organizationType=organizationType;changed=true;
  }
  (subject.chapters||[]).forEach(chapter=>{
   if(!chapter.steps){
    chapter.steps={course:!!chapter.done,summary:!!chapter.done,easy:!!chapter.done,advanced:!!chapter.done};
    if(chapter.done)legacyFinished++;
    changed=true;
   }
   if(typeof chapter.done!=='boolean'){chapter.done=false;changed=true}
  });
 });
 if(!state.learningSystemV2){state.xp+=legacyFinished*50;state.learningSystemV2=true;changed=true}
 if(changed)save();
}
function chapterUnits(chapter){return LEARNING_STEPS.filter(step=>chapter.steps?.[step.key]).length+(chapter.done?1:0)}
function subjectMastery(subject){const total=(subject.chapters||[]).length*5,done=(subject.chapters||[]).reduce((sum,c)=>sum+chapterUnits(c),0);return total?Math.round(done/total*100):0}
function learningXp(){return state.subjects.flatMap(s=>s.chapters||[]).reduce((sum,c)=>sum+LEARNING_STEPS.reduce((n,step)=>n+(c.steps?.[step.key]?step.xp:0),0)+(c.done?25:0),0)}
ensureLearningModel();

renderSubjects=function(){
 ensureLearningModel();
 const chapters=allChapters(),finished=chapters.filter(c=>c.done).length,units=chapters.reduce((n,c)=>n+chapterUnits(c),0),total=chapters.length*5;
 const cards=state.subjects.map(subject=>{const mastery=subjectMastery(subject),open=state.openSubject===subject.id||state.openSubject==null;return `<section class="card mastery-card"><div class="mastery-head"><div class="subject-symbol" style="background:${subject.color}18;color:${subject.color}">${esc(subject.symbol)}</div><div><h2>${esc(subject.name)}</h2><p>${subject.chapters.length} chapitre${subject.chapters.length!==1?'s':''} · ${subject.chapters.filter(c=>c.done).length} maîtrisé${subject.chapters.filter(c=>c.done).length!==1?'s':''}</p></div><div><strong>${mastery}%</strong><div class="progress-bar"><div class="progress-fill" style="width:${mastery}%;background:${subject.color}"></div></div></div><button class="mastery-toggle" data-toggle-subject="${subject.id}" aria-expanded="${open}">${open?'Réduire':'Ouvrir'}</button></div>${open?`<div class="mastery-body"><div class="mastery-table"><div class="mastery-labels"><span>Chapitre</span><span>Cours · 10 XP</span><span>Résumé · 15 XP</span><span>Facile · 20 XP</span><span>Avancé · 30 XP</span><span>Terminé · 25 XP</span></div>${subject.chapters.map(chapter=>{const ready=LEARNING_STEPS.every(step=>chapter.steps?.[step.key]);return `<div class="mastery-row"><div class="chapter-name"><strong>${esc(chapter.name)}</strong><small>${chapterUnits(chapter)}/5 étapes · ${LEARNING_STEPS.reduce((n,s)=>n+(chapter.steps?.[s.key]?s.xp:0),0)+(chapter.done?25:0)} XP</small></div>${LEARNING_STEPS.map(step=>`<button class="stage-btn ${chapter.steps?.[step.key]?'done':''}" data-learning-step="${step.key}" data-subject-id="${subject.id}" data-chapter-id="${chapter.id}" aria-pressed="${!!chapter.steps?.[step.key]}">${chapter.steps?.[step.key]?uiIcon('check'):''}${step.label.replace('Exercices ','')}</button>`).join('')}<button class="stage-btn final ${ready?'ready':''} ${chapter.done?'done':''}" data-chapter-finish data-subject-id="${subject.id}" data-chapter-id="${chapter.id}" ${!ready&&!chapter.done?'disabled':''}>${chapter.done?uiIcon('check')+' Maîtrisé':'Terminer'}</button></div>`}).join('')||'<div class="empty"><h3>Ajoutez votre premier chapitre</h3><p>Chaque chapitre suivra les cinq étapes de maîtrise.</p></div>'}</div><div class="subject-actions"><p class="step-legend">Les quatre étapes débloquent le bouton « Terminer ».</p><div><button class="secondary-btn" data-add-chapter="${subject.id}">+ Chapitre</button> <button class="icon-btn" data-delete-subject="${subject.id}" aria-label="Supprimer la matière">${uiIcon('close')}</button></div></div></div>`:''}</section>`}).join('');
 document.querySelector('#page').innerHTML=header('Mes matières','Transformez chaque chapitre en étapes concrètes et gagnez de l’XP à mesure que vous avancez.',`<button class="primary-btn" id="addSubject">+ Ajouter une matière</button>`)+`<div class="subject-dashboard"><section class="card mastery-summary"><div><span class="eyebrow">MAÎTRISE DU PROGRAMME</span><h2>${finished} chapitre${finished!==1?'s':''} terminé${finished!==1?'s':''}</h2><p>${units} étapes validées sur ${total}. Une progression claire, sans deviner ce qu’il reste à faire.</p></div><div class="mastery-xp"><strong>${learningXp()} XP</strong><small>gagnés dans vos matières</small></div></section>${cards||`<section class="card">${emptyBlock('Votre programme est vide','Ajoutez une matière, puis construisez ses chapitres.')}</section>`}</div>`;
 refreshIcons();
};

const CNC_SUBJECTS={
 MP:['Mathématiques I','Mathématiques II','Physique I','Physique II','Chimie','Informatique','Sciences industrielles','Culture arabe et traduction','Français','Anglais'],
 PSI:['Mathématiques I','Mathématiques II','Physique I','Physique II','Chimie','Sciences industrielles','Informatique','Culture arabe et traduction','Français','Anglais'],
 TSI:['Mathématiques I','Mathématiques II','Physique I','Physique II','Chimie','Informatique','Génie électrique','Génie mécanique','Culture arabe et traduction','Français','Anglais'],
 ECT:['Mathématiques','Économie et droit','Gestion et management','Culture générale','Français','Anglais','Culture arabe et traduction'],
 ECS:['Mathématiques I','Mathématiques II','Culture générale','Géopolitique','Économie','Français','Anglais'],
 EST:['Mathématiques','Physique','Chimie','Sciences industrielles','Informatique','Français','Anglais']
};
function cncContest(filiere){return ['ECS','ECT'].includes(filiere)?'CNAEM':'CNC'}
const FILIERE_NAMES={MP:'Mathématiques–Physique',PSI:'Physique–Sciences de l’ingénieur',TSI:'Technologie et sciences industrielles',ECS:'Économique et commerciale, option scientifique',ECT:'Économique et commerciale, option technologique',EST:'Économie, sciences et technologie (ancienne catégorie)'};
state.cnc={papers:{},...state.cnc};state.cnc.papers=state.cnc.papers||{};
const CNC_FILIERE_COLORS={MP:'#6E56CF',PSI:'#1D6BF3',TSI:'#EA8A00',ECS:'#16A34A',ECT:'#DB2777',EST:'#0891B2'};
function cncDuration(paper){const d=Number(paper?.timerDuration);return Number.isFinite(d)&&d>=300?Math.min(d,8*3600):4*3600}
let cncView={screen:'filieres',filiere:null,subject:null,year:null};
let cncTimer=state.cnc.timer||{paperId:null,duration:4*3600,left:4*3600,running:false,stamp:0};
function paperId(filiere,subject,year){return `${filiere}:${subject}:${year}`}
function getPaper(filiere,subject,year){const id=paperId(filiere,subject,year);return state.cnc.papers[id]||(state.cnc.papers[id]={id,filiere,subject,year,url:'',notes:'',score:'',done:false,timerLeft:4*3600})}
function cncYears(){if(cncView.subject==='Mathématiques (sujet unique)')return [2020];const year=new Date().getFullYear();return [...new Set([...Array.from({length:10},(_,i)=>year-i),...(window.PrepagoCncLibrary?.years(cncView.filiere,cncView.subject)||[])])].sort((a,b)=>b-a)}
function cncHasDocument(paper){return Boolean(window.PrepagoCncLibrary?.find(paper)||paper.url)}
function paperStatus(paper){return paper.done?'Terminé':cncHasDocument(paper)?'Prêt':'À ajouter'}
function openPaper(filiere,subject,year){settleCncTimer();const paper=getPaper(filiere,subject,year);if(cncTimer.paperId!==paper.id){const d=cncDuration(paper);cncTimer={paperId:paper.id,duration:d,left:Number.isFinite(Number(paper.timerLeft))?Math.min(d,Math.max(0,Number(paper.timerLeft))):d,running:false,stamp:0}}cncView={screen:'paper',filiere,subject,year};persistCnc();render()}
function persistCnc(){state.cnc.timer=cncTimer;save()}
function cncCrumbs(){const items=[`<button class="crumb-btn" data-cnc-home>Annales CNC</button>`];if(cncView.filiere)items.push('›',`<button class="crumb-btn" data-cnc-filiere="${cncView.filiere}">${cncView.filiere}</button>`);if(cncView.subject)items.push('›',`<button class="crumb-btn" data-cnc-subject>${esc(cncView.subject)}</button>`);if(cncView.year)items.push('›',String(cncView.year));return `<div class="cnc-breadcrumb">${items.join(' ')}</div>`}
function renderCnc(){
 let content='';
 if(cncView.screen==='filieres'){content=`${header('Annales CNC et CNAEM','Choisis ta filière pour retrouver les annales, tes notes et ton chrono.')}<div class="filiere-grid">${Object.keys(CNC_SUBJECTS).map(f=>`<button class="choice-card" data-cnc-filiere="${f}" style="--filiere-accent:${CNC_FILIERE_COLORS[f]||'#1D6BF3'}"><span class="choice-code">${f}</span><strong>${FILIERE_NAMES[f]}</strong><small>${CNC_SUBJECTS[f].length} matières</small></button>`).join('')}</div>`}
 if(cncView.screen==='subjects'){const subjects=CNC_SUBJECTS[cncView.filiere];content=`${cncCrumbs()}${header(`Filière ${cncView.filiere}`,'Choisis une matière pour consulter ses annales.') }<div class="cnc-subject-grid">${subjects.map((subject,i)=>{const papers=cncYears().map(year=>getPaper(cncView.filiere,subject,year)),done=papers.filter(p=>p.done).length,ready=papers.filter(p=>cncHasDocument(p)).length;return `<button class="choice-card" data-cnc-subject-name="${esc(subject)}"><span class="choice-code">${String(i+1).padStart(2,'0')}</span><strong>${esc(subject)}</strong><small>${done}/${papers.length} terminés · ${ready}/${papers.length} sujets disponibles</small></button>`}).join('')}</div>`}
 if(cncView.screen==='years'){const papers=cncYears().map(year=>getPaper(cncView.filiere,cncView.subject,year));content=`${cncCrumbs()}${header(cncView.subject,`${cncContest(cncView.filiere)} ${cncView.filiere} · annales et corrigés`,`<div class="mini-stat-row"><span class="mini-stat">${papers.filter(p=>p.done).length} terminés</span><span class="mini-stat">${papers.filter(p=>cncHasDocument(p)).length} disponibles</span></div>`)}<div class="paper-list">${papers.map(p=>`<button class="card paper-row" data-cnc-year="${p.year}"><span class="paper-year">${p.year}</span><span><strong>${cncContest(cncView.filiere)} ${esc(cncView.subject)}</strong><small>${p.score!==''?`Note : ${esc(p.score)}/20`:'Aucune note enregistrée'}</small></span><span class="paper-status ${p.done?'finished':cncHasDocument(p)?'ready':''}">${paperStatus(p)}</span></button>`).join('')}</div>`}
 if(cncView.screen==='paper'){content=renderPaperWorkspace()}
 document.querySelector('#page').innerHTML=`<div class="cnc-shell">${content}</div>`;refreshIcons();updateCncClock();
}
function renderPaperWorkspace(){const paper=getPaper(cncView.filiere,cncView.subject,cncView.year);const safeUrl=/^https?:\/\//i.test(paper.url)?esc(paper.url):'';return `${cncCrumbs()}<div class="paper-workspace"><section class="card paper-viewer"><div class="paper-toolbar"><h2>${cncContest(paper.filiere)} ${esc(paper.subject)} · ${paper.year}</h2><div><button class="secondary-btn" data-edit-paper-link>${uiIcon('link')} ${paper.url?'Modifier le lien':'Ajouter le sujet'}</button>${paper.url?`<button class="primary-btn" data-open-paper>Ouvrir</button>`:''}</div></div>${safeUrl?`<iframe class="paper-frame" src="${safeUrl}" title="Sujet ${cncContest(paper.filiere)} ${esc(paper.subject)} ${paper.year}"></iframe>`:`<div class="paper-empty"><div><span class="empty-icon">${uiIcon('cnc')}</span><h3>Sujet à ajouter</h3><p>Ajoute le lien du PDF lorsque tu l’as. Tes notes, ton chrono et ta progression sont déjà prêts.</p><button class="primary-btn" data-edit-paper-link>Ajouter le lien du sujet</button></div></div>`}</section><aside class="exam-side"><section class="card exam-timer"><span class="eyebrow">CHRONO D’ÉPREUVE</span><div class="exam-clock" id="cncClock">${formatCncTime(cncTimer.left)}</div>${cncDurationPicker()}<div class="timer-actions"><button class="primary-btn" data-cnc-timer="toggle">${cncTimer.running?uiIcon('pause')+' Pause':uiIcon('play')+' Démarrer'}</button><button class="secondary-btn" data-cnc-timer="reset">Réinitialiser</button></div></section><section class="card attempt-card"><h2>Résultat de l’essai</h2><label class="score-line"><input id="paperScore" type="number" min="0" max="20" step="0.25" value="${esc(paper.score)}" aria-label="Note sur 20"><span>/ 20</span></label><button class="primary-btn ${paper.done?'completed':''}" data-complete-paper>${paper.done?uiIcon('check')+' Épreuve terminée':'+150 XP · Marquer terminée'}</button></section><section class="card notes-card"><h2>Notes personnelles</h2><textarea class="cnc-notes" id="cncNotes" placeholder="Méthodes à retenir, erreurs, questions à revoir…">${esc(paper.notes)}</textarea><p class="save-line">Enregistré automatiquement dans ton espace</p></section></aside></div>`}

function cncDurationPicker(){const d=cncTimer.duration||4*3600,h=Math.floor(d/3600),m=Math.round(d%3600/60),lock=cncTimer.running?'disabled':'';return `<div class="exam-duration" role="group" aria-label="Durée de l’épreuve"><span class="exam-duration-label">Durée</span><div class="exam-duration-presets">${[2,3,4].map(x=>`<button type="button" class="${d===x*3600?'active':''}" data-cnc-duration="${x*3600}" aria-pressed="${d===x*3600}" ${lock}>${x} h</button>`).join('')}</div><div class="exam-duration-custom"><label><input type="number" id="cncDurH" min="0" max="8" value="${h}" inputmode="numeric" aria-label="Heures" ${lock}><span>h</span></label><label><input type="number" id="cncDurM" min="0" max="59" step="5" value="${m}" inputmode="numeric" aria-label="Minutes" ${lock}><span>min</span></label></div></div>`}
function setCncDuration(seconds){seconds=Math.round(Math.min(8*3600,Math.max(300,Number(seconds)||0)));settleCncTimer();cncTimer.duration=seconds;cncTimer.left=seconds;cncTimer.running=false;const paper=state.cnc.papers[cncTimer.paperId];if(paper){paper.timerDuration=seconds;paper.timerLeft=seconds}persistCnc();
 // Update in place so focus stays in the hours/minutes fields.
 updateCncClock();document.querySelectorAll('[data-cnc-duration]').forEach(b=>{const on=Number(b.dataset.cncDuration)===seconds;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))});const h=document.querySelector('#cncDurH'),m=document.querySelector('#cncDurM');if(h&&document.activeElement!==h)h.value=Math.floor(seconds/3600);if(m&&document.activeElement!==m)m.value=Math.round(seconds%3600/60)}
function formatCncTime(seconds){const s=Math.max(0,Math.ceil(seconds));return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
let lastCncCheckpoint=0;
function settleCncTimer(now=Date.now()){if(!cncTimer.running)return;const elapsed=Math.max(0,(now-cncTimer.stamp)/1000);cncTimer.left=Math.max(0,cncTimer.left-elapsed);cncTimer.stamp=now;const paper=state.cnc.papers[cncTimer.paperId];if(paper)paper.timerLeft=cncTimer.left;if(cncTimer.left<=0){cncTimer.running=false;showToast('Temps écoulé — l’épreuve reste ouverte');persistCnc()}else if(now-lastCncCheckpoint>=15000){lastCncCheckpoint=now;persistCnc()}}
function updateCncClock(){const el=document.querySelector('#cncClock');if(el)el.textContent=formatCncTime(cncTimer.left)}
function editPaperLink(){const paper=getPaper(cncView.filiere,cncView.subject,cncView.year);openModal('Ajouter le sujet '+cncContest(paper.filiere),field('Lien du PDF ou document','url','url',`placeholder="https://…" value="${esc(paper.url)}"`),d=>{if(!/^https?:\/\//i.test(d.url))return;paper.url=d.url});}

const renderWithProductivity=render;
render=function(){if(currentPage==='cnc')renderCnc();else renderWithProductivity();refreshIcons()};
document.addEventListener('click',e=>{
 const toggle=e.target.closest('[data-toggle-subject]');if(toggle){state.openSubject=state.openSubject===toggle.dataset.toggleSubject?'none':toggle.dataset.toggleSubject;save();render()}
 const stepButton=e.target.closest('[data-learning-step]');if(stepButton){const subject=state.subjects.find(s=>s.id===stepButton.dataset.subjectId),chapter=subject?.chapters.find(c=>c.id===stepButton.dataset.chapterId);if(chapter){const step=LEARNING_STEPS.find(s=>s.key===stepButton.dataset.learningStep),next=!chapter.steps[step.key];chapter.steps[step.key]=next;if(!next&&chapter.done){chapter.done=false;chapter.completedAt=null;state.xp=Math.max(0,state.xp-25)}state.xp=Math.max(0,state.xp+(next?step.xp:-step.xp));save();render();showToast(next?`+${step.xp} XP · ${step.label}`:'Étape rouverte')}}
 const finish=e.target.closest('[data-chapter-finish]');if(finish&&!finish.disabled){const subject=state.subjects.find(s=>s.id===finish.dataset.subjectId),chapter=subject?.chapters.find(c=>c.id===finish.dataset.chapterId);if(chapter){chapter.done=!chapter.done;state.xp=Math.max(0,state.xp+(chapter.done?25:-25));save();render();showToast(chapter.done?`Chapitre maîtrisé · ${FULL_CHAPTER_XP} XP au total`:'Chapitre rouvert')}}
 if(e.target.closest('[data-cnc-home]')){cncView={screen:'filieres',filiere:null,subject:null,year:null};render()}
 const filiere=e.target.closest('[data-cnc-filiere]');if(filiere){cncView={screen:'subjects',filiere:filiere.dataset.cncFiliere,subject:null,year:null};render()}
 const subject=e.target.closest('[data-cnc-subject-name]');if(subject){cncView={screen:'years',filiere:cncView.filiere,subject:subject.dataset.cncSubjectName,year:null};render()}
 if(e.target.closest('[data-cnc-subject]')){cncView.screen='years';cncView.year=null;render()}
 const year=e.target.closest('[data-cnc-year]');if(year)openPaper(cncView.filiere,cncView.subject,Number(year.dataset.cncYear));
 if(e.target.closest('[data-edit-paper-link]'))editPaperLink();
 if(e.target.closest('[data-open-paper]')){const paper=getPaper(cncView.filiere,cncView.subject,cncView.year);if(/^https?:\/\//i.test(paper.url))window.open(paper.url,'_blank','noopener')}
 const durationButton=e.target.closest('[data-cnc-duration]');if(durationButton&&!cncTimer.running)setCncDuration(durationButton.dataset.cncDuration);
 const timerButton=e.target.closest('[data-cnc-timer]');if(timerButton){settleCncTimer();if(timerButton.dataset.cncTimer==='reset'){cncTimer.left=cncTimer.duration;cncTimer.running=false}else{cncTimer.running=!cncTimer.running;cncTimer.stamp=Date.now()}const paper=state.cnc.papers[cncTimer.paperId];if(paper)paper.timerLeft=cncTimer.left;persistCnc();render()}
 if(e.target.closest('[data-complete-paper]')){const paper=getPaper(cncView.filiere,cncView.subject,cncView.year);paper.done=!paper.done;paper.completedAt=paper.done?todayISO():null;state.xp=Math.max(0,state.xp+(paper.done?150:-150));save();render();showToast(paper.done?'+150 XP · Épreuve terminée':'Épreuve rouverte')}
});
document.addEventListener('change',e=>{if((e.target.id==='cncDurH'||e.target.id==='cncDurM')&&!cncTimer.running){const h=Math.max(0,Number(document.querySelector('#cncDurH')?.value)||0),m=Math.max(0,Number(document.querySelector('#cncDurM')?.value)||0);setCncDuration(h*3600+m*60)}});
document.addEventListener('input',e=>{if(e.target.id==='cncNotes'){const paper=getPaper(cncView.filiere,cncView.subject,cncView.year);paper.notes=e.target.value;save()}if(e.target.id==='paperScore'){const paper=getPaper(cncView.filiere,cncView.subject,cncView.year);paper.score=e.target.value;save()}});
setInterval(()=>{settleCncTimer();updateCncClock()},1000);window.addEventListener('pagehide',()=>{settleCncTimer();persistCnc()});

let learningSubjectId=null,learningSubjectLevel=null,learningPhysicsTheme=null;
const subjectOrganization=PrepagoSubjectOrganization;
function chapterEarnedXp(chapter){return LEARNING_STEPS.reduce((total,step)=>total+(chapter.steps?.[step.key]?step.xp:0),0)+(chapter.done?25:0)}
function chapterStepButtons(subject,chapter){const ready=LEARNING_STEPS.every(step=>chapter.steps?.[step.key]);return `${LEARNING_STEPS.map(step=>`<button class="stage-btn ${chapter.steps?.[step.key]?'done':''}" data-learning-step="${step.key}" data-subject-id="${subject.id}" data-chapter-id="${chapter.id}" aria-pressed="${!!chapter.steps?.[step.key]}">${chapter.steps?.[step.key]?uiIcon('check'):''}${step.label}</button>`).join('')}<button class="stage-btn final ${ready?'ready':''} ${chapter.done?'done':''}" data-chapter-finish data-subject-id="${subject.id}" data-chapter-id="${chapter.id}" ${!ready&&!chapter.done?'disabled':''}>${chapter.done?uiIcon('check')+' Maîtrisé':'Terminer'}</button>`}
let subjectOverviewFilter='all',subjectOverviewSort='name',subjectOverviewView='grid';
function subjectOverviewIcon(kind,symbol){
 if(kind==='physics')return '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/></svg>';
 if(kind==='industry')return '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M10 2h4l.5 2.3 2 1 2.2-1.1 2.8 2.8-1.1 2.2 1 2L24 11v2l-2.6.5-1 2 1.1 2.2-2.8 2.8-2.2-1.1-2 1L14 23h-4l-.5-2.6-2-1-2.2 1.1-2.8-2.8 1.1-2.2-1-2L0 13v-2l2.6-.5 1-2-1.1-2.2 2.8-2.8 2.2 1.1 2-1Z" transform="translate(2 1) scale(.83)"/></svg>';
 return esc(symbol);
}
function renderSubjectHub(){
 ensureLearningModel();
 const subject=state.subjects.find(item=>item.id===learningSubjectId);
 if(learningSubjectId&&!subject)resetLearningSelection();
 if(!learningSubjectId){
  const listed=state.subjects.filter(item=>!/^\s*tipe\b/i.test(item.name||'')),chapters=listed.flatMap(item=>item.chapters||[]),finished=chapters.filter(c=>c.done).length;
  const visible=listed.filter(item=>subjectOverviewFilter==='all'||(subjectOverviewFilter==='mastered'?item.chapters.length>0&&item.chapters.every(c=>c.done):item.chapters.some(c=>chapterUnits(c)>0)&&item.chapters.some(c=>!c.done))).sort((a,b)=>subjectOverviewSort==='progress'?subjectMastery(b)-subjectMastery(a)||a.name.localeCompare(b.name,'fr'):subjectOverviewSort==='chapters'?b.chapters.length-a.chapters.length||a.name.localeCompare(b.name,'fr'):a.name.localeCompare(b.name,'fr'));
  const cards=visible.map(item=>{const mastery=subjectMastery(item),done=item.chapters.filter(c=>c.done).length,kind=/math/i.test(item.name)?'math':/phys/i.test(item.name)?'physics':/industri|mécan|mecan/i.test(item.name)?'industry':'other',symbol=kind==='physics'?'⚛':item.symbol;return `<article class="card subject-hub-card"><button class="subject-hub-open" data-open-learning-subject="${esc(item.id)}" aria-label="Choisir Sup ou Spé en ${esc(item.name)}"><span class="subject-hub-top"><span class="subject-symbol subject-symbol-${kind}" ${kind==='other'?`style="color:${esc(item.color)};background:${esc(item.color)}18"`:''}>${subjectOverviewIcon(kind,symbol)}</span></span><h2>${esc(item.name)}</h2><p>${item.chapters.length} chapitre${item.chapters.length!==1?'s':''} <span class="subject-separator">·</span> ${done} / ${item.chapters.length} maîtrisés</p><span class="subject-progress-line"><span class="progress-bar"><span class="progress-fill" style="width:${mastery}%"></span></span><strong>${mastery}%</strong></span><span class="subject-card-link"><span aria-hidden="true">›</span>Choisir Sup ou Spé</span></button></article>`}).join('');
  const tab=(id,label)=>`<button type="button" class="${subjectOverviewFilter===id?'active':''}" data-subject-filter="${id}" aria-pressed="${subjectOverviewFilter===id}">${label}</button>`;
  document.querySelector('#page').innerHTML=`<div class="matieres-overview">${programmeBanner()}<section class="matieres-hero"><div class="matieres-hero-copy"><h1>Mes matières</h1><p>Choisis une matière pour gérer ses chapitres et suivre ta progression.</p></div><div class="matieres-hero-note" aria-hidden="true"><span class="matieres-book-icon">${uiIcon('subjects')}</span><span>Apprendre aujourd’hui,<br>construire demain.</span></div><button class="primary-btn matieres-add" id="addSubject"><span aria-hidden="true">＋</span> Ajouter une matière</button></section><section class="matieres-stats" aria-label="Résumé des matières"><div class="matieres-stat"><span class="matieres-stat-icon blue">${uiIcon('subjects')}</span><div><strong>${listed.length}</strong><b>matière${listed.length!==1?'s':''}</b><p>Tu as ajouté ${listed.length} matière${listed.length!==1?'s':''}</p></div></div><div class="matieres-stat"><span class="matieres-stat-icon green">${uiIcon('note')}</span><div><strong>${chapters.length}</strong><b>chapitres</b><p>Au total dans toutes tes matières</p></div></div><div class="matieres-stat"><span class="matieres-stat-icon purple">${uiIcon('progress')}</span><div><strong>${finished}</strong><b>maîtrisés</b><p>${finished?'Continue sur cette lancée !':'Continue, tu en es au début !'}</p></div></div></section><div class="matieres-toolbar"><div class="matieres-tabs" role="group" aria-label="Filtrer les matières">${tab('all','Toutes')}${tab('in-progress','En cours')}${tab('mastered','Maîtrisées')}</div><div class="matieres-tools"><label class="matieres-sort"><span aria-hidden="true">↕</span><select data-subject-sort aria-label="Trier les matières"><option value="name" ${subjectOverviewSort==='name'?'selected':''}>Trier par : Nom</option><option value="progress" ${subjectOverviewSort==='progress'?'selected':''}>Trier par : Progression</option><option value="chapters" ${subjectOverviewSort==='chapters'?'selected':''}>Trier par : Chapitres</option></select><span aria-hidden="true">⌄</span></label><div class="matieres-view" role="group" aria-label="Affichage des matières"><button type="button" class="${subjectOverviewView==='grid'?'active':''}" data-subject-view="grid" aria-label="Vue en grille" aria-pressed="${subjectOverviewView==='grid'}">▦</button><button type="button" class="${subjectOverviewView==='list'?'active':''}" data-subject-view="list" aria-label="Vue en liste" aria-pressed="${subjectOverviewView==='list'}">☷</button></div></div></div><div class="subject-hub-grid ${subjectOverviewView==='list'?'is-list':''}">${cards||`<div class="matieres-empty">${subjectOverviewFilter==='all'?'Aucune matière pour le moment. Ajoute ta première matière.':subjectOverviewFilter==='mastered'?'Aucune matière maîtrisée pour le moment.':'Aucune matière en cours.'}</div>`}</div></div>`;
 }else{
  document.querySelector('#page').innerHTML=renderSubjectOrganization(subject);
 }
 refreshIcons();
}
renderSubjects=renderSubjectHub;
const navigateWithSubjectHub=navigate;
navigate=function(page){if(page==='subjects')resetLearningSelection();return navigateWithSubjectHub(page)};
document.addEventListener('click',e=>{
 const filter=e.target.closest('[data-subject-filter]');if(filter){subjectOverviewFilter=filter.dataset.subjectFilter;render();return}
 const view=e.target.closest('[data-subject-view]');if(view){subjectOverviewView=view.dataset.subjectView;render();return}
 const open=e.target.closest('[data-open-learning-subject]');if(open){resetLearningSelection(open.dataset.openLearningSubject);render()}
 if(e.target.closest('[data-back-to-subjects]')){resetLearningSelection();render()}
 const remove=e.target.closest('[data-remove-learning-chapter]');if(remove){const subject=state.subjects.find(item=>item.id===remove.dataset.subjectId),chapter=subject?.chapters.find(item=>item.id===remove.dataset.removeLearningChapter);if(subject&&chapter&&confirm(`Supprimer le chapitre « ${chapter.name} » ?`)){state.xp=Math.max(0,state.xp-chapterEarnedXp(chapter));window.PrepagoCurriculum?.dismissChapter(state,chapter);subject.chapters=subject.chapters.filter(item=>item.id!==chapter.id);save();render();showToast('Chapitre supprimé')}}
});
document.addEventListener('change',e=>{if(e.target.matches('[data-subject-sort]')){subjectOverviewSort=e.target.value;render()}});
render();
