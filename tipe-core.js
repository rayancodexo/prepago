/* One TIPE per account. Legacy project IDs remain valid session/task links. */
(function (root) {
  const stages = [['subject','Sujet'],['research','Recherche'],['model','Modélisation'],['experiment','Expérimentation'],['analysis','Résultats'],['oral','Oral']];
  const limits = {motivation:50,anchor:50,problematic:50,objectives:100,bibliography:650,oralPlan:50};
  const milestones = [['subject','Sujet et encadrant'],['mcot','MCOT'],['documents','Présentation, DOT et F2'],['validation','Validation administrative'],['oral','Passage à l’oral']];
  const words = value => String(value || '').trim().split(/\s+/u).filter(Boolean).length;
  const keywords = value => String(value || '').split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  function primary(state) {
    const projects = state.projects || [];
    return projects.find(p => p.id === state.tipeProjectId) || projects.find(p => p.kind === 'tipe' && !p.archived) || projects.find(p => !p.archived) || projects[0] || null;
  }
  function ids(state) { return new Set((state.projects || []).map(p => p.id)); }
  function data(project) {
    return {session:'',motivation:'',anchor:'',positioning:'',keywordsFr:'',keywordsEn:'',objectives:project?.description || '',bibliography:'',oralPlan:'',oralQuestions:'',references:[],journal:[],dot:[],documents:[],removed:[],deadlines:{},checks:{},...(project?.tipeData || {})};
  }
  function readiness(project) {
    const d = data(project), text = (value,max) => words(value) > 0 && words(value) <= max;
    return [
      {label:'Sujet et problématique',ok:!!project?.name && project.name !== 'Mon TIPE' && text(project.problematic,50)},
      {label:'Motivation et ancrage',ok:text(d.motivation,50) && text(d.anchor,50)},
      {label:'Positionnement et mots-clés',ok:!!d.positioning.trim() && keywords(d.keywordsFr).length === 5 && keywords(d.keywordsEn).length === 5},
      {label:'Bibliographie et références',ok:text(d.bibliography,650) && d.references.length >= 2 && d.references.length <= 10},
      {label:'Objectifs personnels',ok:text(d.objectives,100)},
      {label:'DOT rédigé',ok:d.dot.length > 0 && d.dot.every(e => text(e.text,50))},
      {label:'Plan de présentation',ok:text(d.oralPlan,50)},
      {label:'Documents vérifiés',ok:!!d.checks.presentation && !!d.checks.f2},
      {label:'Dépôt et validation',ok:!!d.checks.submitted && !!d.checks.validated}
    ];
  }
  function upsertMilestone(state,project,key,date,makeId) {
    const label = milestones.find(([k]) => k === key)?.[1];
    if (!label) return;
    let existing = state.events.find(e => e.tipeMilestone === key && e.projectId === project.id);
    if (!date) {
      if (existing) {
        state.calendarTrash = [...(state.calendarTrash || []).filter(e => e.id !== existing.id),{...existing}];
        state.events = state.events.filter(e => e.id !== existing.id);
      }
      return;
    }
    if (!existing) {
      existing = (state.calendarTrash || []).find(e => e.tipeMilestone === key && e.projectId === project.id);
      if (existing) {state.calendarTrash = state.calendarTrash.filter(e => e.id !== existing.id); state.events.push(existing);}
    }
    const values = {title:`TIPE · ${label}`,date,endDate:date,time:'',end:'',allDay:true,category:'exam',projectId:project.id,tipeMilestone:key};
    if (existing) Object.assign(existing,values);
    else state.events.push({id:makeId(),...values});
  }
  function removeEntry(project,collection,id) {
    if(!['references','journal','dot','documents'].includes(collection))return false;
    const d=data(project),record=d[collection].find(r=>r.id===id);if(!record)return false;
    d[collection]=d[collection].filter(r=>r.id!==id);
    d.removed.push({id:collection+':'+id,collection,record});project.tipeData=d;return true;
  }
  function restoreEntry(project,id) {
    const d=data(project),entry=d.removed.find(r=>r.id===id);if(!entry)return false;
    if(!['references','journal','dot','documents'].includes(entry.collection))return false;
    if(!d[entry.collection].some(r=>r.id===entry.record.id))d[entry.collection].push(entry.record);
    d.removed=d.removed.filter(r=>r.id!==id);project.tipeData=d;return true;
  }
  root.PrepagoTipeCore = {stages,limits,milestones,words,keywords,primary,ids,data,readiness,upsertMilestone,removeEntry,restoreEntry};
})(typeof window !== 'undefined' ? window : globalThis);
