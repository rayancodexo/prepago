/* Planned and recorded work share one 24-hour calendar. Recorded time is read-only. */
(() => {
  const core=window.PrepagoCalendarCore;
  let view=innerWidth<=767?'day':'week',mode='planned',category='all',tipeOnly=false,scrollTop=6*52-14;
  const categories={study:'Révisions',class:'Cours',exam:'Examens',sport:'Sport',personal:'Personnel',task:'Tâches'};
  const shortDate=day=>new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short'}).format(new Date(day+'T12:00:00'));
  const weekday=day=>new Intl.DateTimeFormat('fr-FR',{weekday:'short'}).format(new Date(day+'T12:00:00'));
  const snapshot=()=>window.PrepagoFocus?.snapshot() || {rows:[],ready:false,active:null};
  const ids=()=>window.PrepagoTipeCore.ids(state);
  const opts=()=>({category,tipe:tipeOnly,ids:ids()});
  const rows=day=>mode==='real'?core.recorded(snapshot().rows,day,opts()):core.planned(state,day,opts());
  const title=row=>row.kind==='session'?row.item.session_goal || row.item.subject_name || 'Étude libre':row.item.title;
  const linked=row=>ids().has(row.kind==='session'?row.item.project_id:row.item.projectId);
  const total=values=>values.reduce((n,r)=>n+(r.seconds || 0),0);
  const unique=values=>Array.from(new Map(values.map(r=>[r.kind==='session'?'session:'+r.item.id:r.key,r])).values());
  function actionAttrs(row) {return row.kind==='session'?`data-cal-session="${esc(row.item.id)}" data-cal-session-day="${row.day}"`:row.item.kind==='task'?`data-task-edit="${esc(row.item.id)}"`:`data-edit-event="${esc(row.item.id)}"`;}
  function timeLabel(row) {return row.allDay?(row.unknownTime?'Horaire non renseigné':'Sans horaire'):`${core.clock(row.startMinute)}${row.endKnown?' – '+core.clock(row.endMinute):' · fin à préciser'}`;}
  function eventButton(row,geometry='') {
    const status=row.kind==='session'?(row.item.status==='completed'?'Terminée':'Interrompue'):row.item.done?'Terminée':categories[row.category];
    return `<button class="cal-event cal-${row.category} ${mode==='real'?'cal-recorded':''} ${row.item.done?'is-done':''} ${!row.allDay&&!row.endKnown?'cal-open-end':''} ${!row.allDay&&row.endMinute-row.startMinute<40?'cal-short':''}" ${actionAttrs(row)} ${geometry} aria-label="${esc(title(row))}, ${esc(timeLabel(row))}${linked(row)?', TIPE':''}"><strong>${esc(title(row))}</strong><span>${esc(timeLabel(row))}</span><small>${linked(row)?'TIPE · ':''}${esc(status || '')}</small></button>`;
  }
  function timeline(days) {
    const currentDay=todayISO(), now=new Date(), minute=now.getHours()*60+now.getMinutes();
    return `<div class="cal-timeline-wrap"><div class="cal-days" style="--cal-days:${days.length}"><span class="cal-gutter-head">24 h</span>${days.map(day=>`<button data-cal-date="${day}" class="cal-day-head ${day===selectedDay?'is-selected':''} ${day===currentDay?'is-today':''}" aria-pressed="${day===selectedDay}" aria-label="${formatDate(new Date(day+'T12:00:00'))}"><span>${weekday(day)}</span><strong>${Number(day.slice(-2))}</strong></button>`).join('')}</div>
      <div class="cal-unscheduled" style="--cal-days:${days.length}"><span>Sans<br>horaire</span>${days.map(day=>`<div>${rows(day).filter(r=>r.allDay).map(r=>eventButton(r)).join('')}</div>`).join('')}</div>
      <div class="cal-timeline-scroll" tabindex="0" aria-label="Agenda de 00 h à 24 h"><div class="cal-timeline" style="--cal-days:${days.length}"><div class="cal-time-axis">${Array.from({length:25},(_,h)=>`<span style="top:${h*52}px">${String(h).padStart(2,'0')}:00</span>`).join('')}</div>${days.map(day=>{
        const laidOut=core.layout(rows(day),32*60/52);
        return `<div class="cal-day-column ${day===selectedDay?'is-selected':''}">${Array.from({length:24},(_,hour)=>`<button class="cal-hour-slot" data-cal-slot="${day}" data-cal-minute="${hour*60}" style="top:${hour*52}px" aria-label="${mode==='planned'?'Planifier':'Voir'} le ${shortDate(day)} à ${String(hour).padStart(2,'0')}:00"></button>`).join('')}
          ${laidOut.map(r=>eventButton(r,`style="top:${r.startMinute*52/60}px;height:${Math.max(32,(r.endMinute-r.startMinute)*52/60)}px;left:calc(${r.column/r.columns*100}% + 3px);width:calc(${100/r.columns}% - 6px)"`)).join('')}
          ${day===currentDay?`<div class="cal-now-line" data-cal-now-day="${day}" aria-hidden="true" style="top:${minute*52/60}px"></div>`:''}</div>`;
      }).join('')}</div></div></div>`;
  }
  function month() {
    return `<div class="cal-month-weekdays">${['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(l=>`<span>${l}</span>`).join('')}</div><div class="cal-month-grid">${core.monthDays(selectedDay).map(day=>{
      const list=unique(rows(day)),outside=day.slice(0,7)!==selectedDay.slice(0,7);
      return `<button class="cal-month-day ${outside?'is-outside':''} ${day===selectedDay?'is-selected':''} ${day===todayISO()?'is-today':''}" data-cal-date="${day}" aria-label="${formatDate(new Date(day+'T12:00:00'))}, ${list.length} élément${list.length===1?'':'s'}" aria-pressed="${day===selectedDay}"><strong>${Number(day.slice(-2))}</strong>${list.slice(0,3).map(r=>`<span class="cal-month-item cal-${r.category}">${r.allDay?'':core.clock(r.startMinute)+' '}${esc(title(r))}</span>`).join('')}${list.length>3?`<small>+ ${list.length-3}</small>`:''}</button>`;
    }).join('')}</div>`;
  }
  function agenda() {
    const list=unique(rows(selectedDay)), dayRows=rows(selectedDay);
    const plannedRows=core.planned(state,selectedDay,opts()),realRows=core.recorded(snapshot().rows,selectedDay,opts());
    const live=snapshot().active,hasLive=live?.kind==='work';
    return `<aside class="cal-agenda"><header><span class="tipe-caption">${mode==='real'?'TRAVAIL ENREGISTRÉ':'PROGRAMME DU JOUR'}</span><h2>${formatDate(new Date(selectedDay+'T12:00:00'))}</h2></header><div class="cal-day-totals"><div><strong>${FocusData.duration(total(plannedRows))}</strong><span>Prévues / estimées</span></div><div><strong>${FocusData.duration(total(realRows))}</strong><span>Étudiées, hors pauses</span></div></div>
      ${mode==='real'&&!snapshot().ready?'<p role="status" class="cal-empty">Chargement des sessions…</p>':list.map(row=>{
        if(row.kind==='session') {
          const segments=dayRows.filter(r=>r.item.id===row.item.id),seconds=segments.reduce((n,r)=>n+r.seconds,0);
          return `<article class="cal-agenda-item cal-session-detail" id="cal-session-${esc(row.item.id)}"><div class="cal-agenda-tag">${linked(row)?'TIPE · ':''}${esc(row.item.subject_name || 'Étude libre')}</div><h3>${esc(title(row))}</h3><p>${segments.map(timeLabel).map(esc).join(' · ')}</p><strong>${FocusData.duration(seconds)} effectives</strong><span class="tipe-caption">${row.item.status==='completed'?'Terminée':'Interrompue · temps conservé'}</span>${row.item.task_id&&state.tasks.some(t=>t.id===row.item.task_id)?`<button class="link-btn" data-task-edit="${esc(row.item.task_id)}">Voir la tâche</button>`:''}</article>`;
        }
        return `<article class="cal-agenda-item"><div class="cal-agenda-tag cal-${row.category}">${categories[row.category]}${linked(row)?' · TIPE':''}</div><h3>${esc(title(row))}</h3><p>${esc(timeLabel(row))}</p><div class="cal-agenda-actions">${row.item.kind==='task'?`<label class="cal-task-check"><input type="checkbox" data-task="${esc(row.item.id)}" ${row.item.done?'checked':''} aria-label="Terminer : ${esc(title(row))}">Terminée</label><button class="link-btn" data-task-edit="${esc(row.item.id)}">Modifier</button>${!row.item.done?`<button class="link-btn" data-task-focus="${esc(row.item.id)}">Travailler</button>`:''}`:`<button class="link-btn" data-edit-event="${esc(row.item.id)}">Modifier</button><button class="link-btn" data-event-focus="${esc(row.item.id)}">Travailler</button><button class="link-btn" data-cal-retire="${esc(row.item.id)}" aria-label="Retirer ${esc(title(row))}">Retirer</button>`}</div></article>`;
      }).join('') || `<div class="cal-empty"><h3>${mode==='real'?'Aucun temps enregistré':'La journée est libre'}</h3><p>${mode==='real'?'Les sessions terminées ou interrompues apparaissent ici, sans leurs pauses.':'Planifie un cours, une révision, du sport ou une étape du TIPE.'}</p></div>`}
      ${mode==='real'?`<p class="cal-footnote">${hasLive?'Une session est en cours. Son temps apparaîtra ici après enregistrement.':'Les horaires viennent des sessions de concentration. Les anciennes sessions sans horaire restent dans la ligne « Sans horaire ».'}</p><button class="secondary-btn" data-go="focus">${hasLive?'Reprendre la session':'Démarrer une session'}</button>`:'<button class="secondary-btn" data-cal-add-task>+ Tâche ce jour</button>'}${state.calendarTrash?.length ? `<details class="cal-trash"><summary>Créneaux retirés (${state.calendarTrash.length})</summary>${state.calendarTrash.map(item=>`<div><span>${esc(item.title)} · ${shortDate(item.date)}</span><button class="link-btn" data-cal-restore="${esc(item.id)}">Restaurer</button></div>`).join('')}</details>` : ''}</aside>`;
  }
  function render() {
    const previous=document.querySelector('.cal-timeline-scroll');if(previous)scrollTop=previous.scrollTop;
    const days=view==='week'?weekDates(selectedDay):[selectedDay];
    const range=view==='month'?new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(selectedDay+'T12:00:00')):view==='week'?`${shortDate(days[0])} – ${shortDate(days[6])}`:formatDate(new Date(selectedDay+'T12:00:00'));
    document.querySelector('#page').innerHTML=`<div class="calendar-workspace"><header class="cal-header"><div><h1>Calendrier</h1><p>${mode==='real'?'Le temps étudié, aux heures où tu l’as réellement effectué.':'Une place pour tes cours, tes révisions et ton TIPE.'}</p></div><button class="primary-btn" data-cal-create>+ Planifier</button></header>
      <div class="cal-toolbar"><div class="cal-mode-switch" role="group" aria-label="Calendrier prévu ou réel">${[['planned','Prévu'],['real','Réel']].map(([k,l])=>`<button data-cal-mode="${k}" aria-pressed="${mode===k}" class="${mode===k?'active':''}">${l}</button>`).join('')}</div><div class="cal-range"><button class="icon-btn" data-cal-shift="-1" aria-label="Période précédente">${uiIcon('left')}</button><h2>${range}</h2><button class="icon-btn" data-cal-shift="1" aria-label="Période suivante">${uiIcon('right')}</button><button class="secondary-btn" data-cal-today>Aujourd’hui</button></div><label class="cal-date-jump"><input type="date" value="${selectedDay}" aria-label="Aller à une date" id="calDateJump"></label><div class="cal-view-switch" role="group" aria-label="Affichage du calendrier">${[['day','Jour'],['week','Semaine'],['month','Mois']].map(([k,l])=>`<button data-cal-view="${k}" aria-pressed="${view===k}" class="${view===k?'active':''}">${l}</button>`).join('')}</div></div>
      <div class="cal-filterbar"><div class="cal-legend">${Object.entries(categories).slice(0,5).map(([k,l])=>`<span><i class="cal-${k}"></i>${l}</span>`).join('')}</div><label><span class="sr-only">Catégorie</span><select id="calCategory" aria-label="Filtrer le calendrier par catégorie"><option value="all">Toutes les catégories</option>${Object.entries(categories).filter(([k])=>mode!=='real'||k==='study').map(([k,l])=>`<option value="${k}" ${category===k?'selected':''}>${l}</option>`).join('')}</select></label><button class="cal-tipe-toggle ${tipeOnly?'active':''}" data-cal-tipe aria-pressed="${tipeOnly}">TIPE uniquement</button></div>
      <div class="cal-workspace-grid"><section class="cal-surface" aria-label="${view==='month'?'Calendrier du mois':'Agenda de 24 heures'}">${view==='month'?month():timeline(days)}</section>${agenda()}</div></div>`;
    const scroller=document.querySelector('.cal-timeline-scroll');if(scroller)scroller.scrollTop=scrollTop;
    document.body.dataset.page='calendar';
  }
  renderCalendar=render;
  eventEditor=function(id) {
    const existing=state.events.find(e=>e.id===id);if(id&&!existing)return;
    const event=existing || {date:selectedDay,endDate:selectedDay,time:'09:00',end:'10:00',title:'',category:'study',projectId:tipeOnly?window.PrepagoTipe.ensure().id:''};
    const field=(label,name,value,type='text',extra='')=>`<div class="tipe-field"><label for="calEvent-${name}">${label}</label><input id="calEvent-${name}" type="${type}" name="${name}" value="${esc(value || '')}" ${extra}></div>`;
    openModal(id?'Modifier le créneau':'Planifier un créneau',field('Titre','title',event.title,'text','required maxlength="180" pattern=".*\\S.*"')
      + `<div class="tipe-form-grid">${field('Date','date',event.date,'date','required')}${field('Date de fin','endDate',event.endDate || event.date,'date','required')}</div>
      <label class="cal-all-day"><input type="checkbox" name="allDay" ${event.allDay || !event.time?'checked':''}>Sans horaire / toute la journée</label><div class="tipe-form-grid" id="calTimeFields">${field('Début','time',event.time,'time')}${field('Fin (facultative)','end',event.end,'time')}</div>
      <div class="tipe-field"><label for="calEvent-category">Catégorie</label><select id="calEvent-category" name="category">${Object.entries(categories).filter(([k])=>k!=='task').map(([k,l])=>`<option value="${k}" ${event.category===k?'selected':''}>${l}</option>`).join('')}</select></div>${window.PrepagoConnections.projectField(event.projectId || '')}`,values=>{
        const data={...values,title:values.title.trim(),allDay:values.allDay==='on'};
        if(data.allDay){data.time='';data.end='';}
        if(existing?.tipeMilestone&&ids().has(existing.projectId)){
          const p=window.PrepagoTipeCore.primary(state),meta=window.PrepagoTipeCore.data(p);
          p.tipeData={...meta,deadlines:{...meta.deadlines,[existing.tipeMilestone]:ids().has(data.projectId)?data.date:''}};
        }
        if(existing)Object.assign(existing,data);else state.events.push({id:uid('e'),...data});
        selectedDay=data.date;calendarDate=new Date(data.date+'T12:00:00');
      });
    const form=document.querySelector('#modalForm');let autoEndDate=true;
    const dateSpan=Math.max(0,Math.round((Date.parse((event.endDate || event.date)+'T00:00:00Z')-Date.parse(event.date+'T00:00:00Z'))/86400000));
    const validate=()=>{
      const fields=form.elements,allDay=fields.allDay.checked;
      document.querySelector('#calTimeFields').hidden=allDay;fields.time.required=!allDay;
      fields.time.disabled=fields.end.disabled=allDay;
      fields.endDate.min=fields.date.value;
      fields.endDate.setCustomValidity(fields.endDate.value<fields.date.value?'La date de fin doit suivre la date de début.':'');
      fields.end.setCustomValidity(!allDay&&fields.end.value&&core.at(fields.endDate.value,fields.end.value)<=core.at(fields.date.value,fields.time.value)?'La fin doit être après le début.':'');
    };
    form.addEventListener('input',e=>{if(e.target.name==='date'&&autoEndDate&&form.elements.date.value){const finish=new Date(form.elements.date.value+'T12:00:00');finish.setDate(finish.getDate()+dateSpan);form.elements.endDate.value=core.iso(finish);}if(e.target.name==='endDate')autoEndDate=false;validate();});form.addEventListener('change',validate);validate();
  };
  document.addEventListener('change',e=>{
    if(e.target.id==='calDateJump'&&e.target.value){selectedDay=e.target.value;calendarDate=new Date(selectedDay+'T12:00:00');render();}
    if(e.target.id==='calCategory'){category=e.target.value;render();}
  });
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;const d=b.dataset;
    if('calCreate' in d)eventEditor();
    if(d.calRetire&&core.retireEvent(state,d.calRetire)){save();render();showToast('Créneau retiré. Il reste restaurable dans le calendrier.');}
    if(d.calRestore&&core.restoreEvent(state,d.calRestore)){save();render();showToast('Créneau restauré');}
    if(d.calMode){mode=d.calMode;category='all';render();}
    if(d.calView){view=d.calView;render();}
    if(d.calShift){selectedDay=core.shift(selectedDay,view,Number(d.calShift));calendarDate=new Date(selectedDay+'T12:00:00');render();}
    if('calToday' in d){selectedDay=todayISO();calendarDate=new Date();render();}
    if('calTipe' in d){tipeOnly=!tipeOnly;render();}
    if(d.calDate){selectedDay=d.calDate;calendarDate=new Date(selectedDay+'T12:00:00');render();}
    if(d.calSlot){selectedDay=d.calSlot;render();if(mode==='real')return;eventEditor();const form=document.querySelector('#modalForm'),minute=Number(d.calMinute);form.elements.time.value=core.clock(minute);form.elements.end.value=core.clock(Math.min(1439,minute+60));if(tipeOnly)form.elements.projectId.value=window.PrepagoTipe.ensure().id;}
    if('calAddTask' in d){taskEditor();const form=document.querySelector('#modalForm');form.elements.date.value=selectedDay;if(tipeOnly)form.elements.projectId.value=window.PrepagoTipe.ensure().id;}
    if(d.calSession){if(d.calSessionDay&&selectedDay!==d.calSessionDay){selectedDay=d.calSessionDay;render();}const detail=document.getElementById('cal-session-'+d.calSession);if(detail){detail.scrollIntoView({block:'nearest',behavior:'smooth'});detail.classList.add('cal-highlight');setTimeout(()=>detail.classList.remove('cal-highlight'),1500);}}
  });
  window.addEventListener('prepago:state-replaced',()=>{view=innerWidth<=767?'day':'week';mode='planned';category='all';tipeOnly=false;selectedDay=todayISO();calendarDate=new Date();scrollTop=6*52-14;});
  setInterval(()=>{if(currentPage!=='calendar')return;const now=new Date();document.querySelectorAll('.cal-now-line').forEach(line=>{line.hidden=line.dataset.calNowDay!==todayISO();line.style.top=(now.getHours()*60+now.getMinutes())*52/60+'px';});},60000);
  window.PrepagoCalendar={open(options={}){mode=options.mode || 'planned';tipeOnly=!!options.tipe;category='all';selectedDay=options.day || todayISO();calendarDate=new Date(selectedDay+'T12:00:00');navigate('calendar');},render};
})();
