/* TIPE workspace and chapter checkpoints use the existing account state and links. */
(()=>{
 const projects=()=>state.projects||[];
 const project=id=>projects().find(p=>p.id===id);
 const snapshot=()=>window.PrepagoFocus?.snapshot()||{rows:[],active:null,ready:false};
 const projectOptions=(value='',all=false)=>{
  const p=window.PrepagoTipeCore.primary(state),linked=value&&projects().some(x=>x.id===value);
  return `<option value="">${all?'Tout le calendrier':'Sans TIPE'}</option>`+(p?`<option value="${esc(linked?value:p.id)}" ${value?'selected':''}>Mon TIPE</option>`:'');
 };
 const projectField=value=>`<div class="field"><label for="linkedProject">TIPE (facultatif)</label><select name="projectId" id="linkedProject">${projectOptions(value)}</select></div>`;
 const pill=id=>project(id)?'<span class="connection-label">TIPE</span>':'';
 function projectEditor(){window.PrepagoTipe?.editSubject()}
 function renderProjects(){window.PrepagoTipe?.render()}
 pageNames.projects = 'TIPE';
 iconFiles.projects = 'notebook-pen';
 const nav = document.createElement('button');
 nav.className = 'nav-item'; nav.dataset.page = 'projects';
 nav.innerHTML = '<span class="icon"></span>TIPE';
 document.querySelector('[data-page="tasks"]').after(nav);
 const baseRender=render;render=function(){if(currentPage!=='projects')return baseRender();window.PrepagoFocus?.leaveImmersive();renderProjects();document.body.dataset.page='projects';document.querySelectorAll('.nav-item').forEach(n=>{n.classList.toggle('active',n.dataset.page==='projects');if(n.dataset.page==='projects')n.setAttribute('aria-current','page');else n.removeAttribute('aria-current')});document.body.classList.remove('focus-cockpit-immersive');refreshIcons();updateSidebar()};
 const baseTaskEditor=taskEditor;taskEditor=function(id,date){baseTaskEditor(id,date);document.querySelector('#modalForm .form-actions').insertAdjacentHTML('beforebegin',projectField(state.tasks.find(t=>t.id===id)?.projectId||''))};
 const baseEventEditor=eventEditor;eventEditor=function(id){baseEventEditor(id);document.querySelector('#modalForm .form-actions').insertAdjacentHTML('beforebegin',projectField(state.events.find(t=>t.id===id)?.projectId||''))};
 const baseTaskRow=taskWorkspaceRow;taskWorkspaceRow=function(t){return baseTaskRow(t).replace('</button><div>',`</button>${pill(t.projectId)}<div>`)};
 window.PrepagoConnections={projectField,projectOptions,focusFields(c){const task=state.tasks.find(t=>t.id===c.taskId),event=state.events.find(t=>t.id===c.eventId);return `<label>TIPE<select name="projectId" id="fcProject">${projectOptions(c.projectId)}</select></label>${task||event?`<p class="fc-caption">${task?'Tâche':'Créneau'} : ${esc((task||event).title)} · <button type="button" class="link-btn" data-unlink-focus>Détacher</button></p>`:''}`}};
 const baseOverview=renderOverview;
 renderOverview=function(){
  baseOverview();
  const reference=Boolean(document.querySelector('.dashboard-reference'));
  document.querySelector('.dashboard-events>.dashboard-add')?.remove();
  const upcoming=reference?dashboardUpcomingEvents().slice(0,1):state.events.filter(e=>new Date((e.endDate||e.date)+'T'+(e.end||e.time||'23:59'))>=new Date()).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,3);
  document.querySelector('.dashboard-events .dashboard-panel-list').innerHTML=upcoming.length?upcoming.map(dashboardEventRow).join(''):`<div class="dashboard-panel-empty"><p>Aucun événement à venir.</p><button class="link-btn" ${reference?'data-dashboard-new-event':'data-new-event'}>+ Planifier un événement</button></div>`;
 };
 const baseSubjects=renderSubjects;renderSubjects=function(){baseSubjects();const s=state.subjects.find(s=>s.id===learningSubjectId);if(!s)return;document.querySelectorAll('[data-chapter-card]').forEach(card=>{const c=s.chapters.find(c=>c.id===card.dataset.chapterCard),next=LEARNING_STEPS.find(step=>!c.steps?.[step.key]);card.querySelector('.chapter-steps').insertAdjacentHTML('beforebegin',`<div class="chapter-direction"><span>${c.done?'Chapitre maîtrisé':`Prochaine étape : <strong>${next?.label||'Valider le chapitre'}</strong>`}</span><span>${chapterUnits(c)}/5</span></div><div class="fc-progress chapter-progress"><span style="width:${chapterUnits(c)*20}%"></span></div>`);if(next)card.querySelector(`[data-learning-step="${next.key}"]`)?.classList.add('next-step');card.querySelector('.chapter-notes').insertAdjacentHTML('beforebegin',`<div class="chapter-checkpoints"><div><strong>Lecture du cours / PDF</strong><span>Position enregistrée manuellement</span></div><label>Page lue<input type="number" min="0" max="${Number(c.pdfPages)||9999}" value="${Number(c.pdfPage)||0}" data-checkpoint="pdfPage" data-chapter="${esc(c.id)}" aria-label="Page lue — ${esc(c.name)}"></label><label>Sur<input type="number" min="1" max="9999" value="${Number(c.pdfPages)||''}" data-checkpoint="pdfPages" data-chapter="${esc(c.id)}" aria-label="Nombre de pages — ${esc(c.name)}" placeholder="Total"></label>${/^https?:\/\//i.test(c.resource||'')?`<a class="secondary-btn" target="_blank" rel="noopener" href="${esc(c.resource)}">Ouvrir le document</a>`:''}<label class="chapter-exercise-note">Prochain exercice / point à revoir<input type="text" maxlength="180" value="${esc(c.nextExercise||'')}" data-checkpoint="nextExercise" data-chapter="${esc(c.id)}" placeholder="Ex. Exercice 4, question 2"></label></div>`);const focus=card.querySelector('[data-chapter-focus]');if(focus){focus.removeAttribute('data-chapter-focus');focus.dataset.connectedChapter=c.id}})};
 document.addEventListener('change',e=>{if(e.target.matches('[data-checkpoint]')){const c=allChapters().find(c=>c.id===e.target.dataset.chapter);if(!c||!e.target.reportValidity())return;const key=e.target.dataset.checkpoint;c[key]=key==='nextExercise'?e.target.value:Math.max(key==='pdfPages'?1:0,Math.min(9999,Number(e.target.value)||0));if(c.pdfPages&&c.pdfPage>c.pdfPages)c.pdfPage=c.pdfPages;save();if(key==='pdfPages')renderSubjects()}});
 document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if('projectNew'in d)projectEditor();if(d.projectEdit)projectEditor(d.projectEdit);
  if(d.projectTask){taskEditor();document.querySelector('#linkedProject').value=d.projectTask;const p=project(d.projectTask);document.querySelector('#modalForm').elements.subject.value=state.subjects.find(s=>s.id===p.subjectId)?.name||''}
  if(d.projectEvent){eventEditor();document.querySelector('#linkedProject').value=d.projectEvent}
  if(d.projectFocus){const p=project(d.projectFocus);prepareFocus({title:p.name,projectId:p.id,subject:state.subjects.find(s=>s.id===p.subjectId)?.name||''})}
  if(d.projectCalendar)window.PrepagoCalendar?.open({mode:'real',tipe:true});
  if(d.eventFocus){const event=state.events.find(x=>x.id===d.eventFocus),minutes=event.end?(Date.parse((event.endDate||event.date)+'T'+event.end)-Date.parse(event.date+'T'+event.time))/60000:25;prepareFocus({title:event.title,projectId:event.projectId,eventId:event.id,minutes})}
  if(d.connectedChapter){const s=state.subjects.find(s=>s.id===learningSubjectId),c=s.chapters.find(c=>c.id===d.connectedChapter);state.lastStudy={subject:s.id,chapter:c.id};save();prepareFocus({subject:s.name,chapterId:c.id,title:c.nextExercise||c.name})}
  if('unlinkFocus'in d){const c=snapshot().settings;prepareFocus({title:c.goal,subject:state.subjects.find(s=>s.id===c.subjectId)?.name||'',chapterId:c.chapterId,projectId:c.projectId,minutes:c.work})}
 });
 window.addEventListener('prepago:study-changed',()=>{if(['overview','projects','calendar','progress'].includes(currentPage)&&document.querySelector('#modalBackdrop').hidden)render()});
})();
