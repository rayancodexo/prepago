/* TIPE is a continuous research workspace, persisted with the existing account state. */
(() => {
  const core = window.PrepagoTipeCore;
  const notice = 'https://physicsschool.um6p.ma/wp-content/uploads/2026/03/2026-02-03-74547.pdf';
  const themeSource = 'https://www.education.gouv.fr/bo/2026/Hebdo5/ESRS2600935A';
  const safeURL = value => /^https?:\/\//i.test(String(value || '').trim()) ? String(value).trim() : '';
  const kindLabels = {research:'Recherche',model:'Modélisation',experiment:'Expérience',analysis:'Analyse',meeting:'Échange avec l’encadrant'};
  let draftTimer=null,pendingDraft=null;
  function flushDraft() {
    clearTimeout(draftTimer);draftTimer=null;
    if(!pendingDraft)return;
    const {account,form}=pendingDraft;pendingDraft=null;
    if(account!==state)return;
    save();updateReadiness();
    if(form.isConnected)form.querySelector('.tipe-form-status').textContent='Brouillon enregistré';
  }
  function updateReadiness() {
    const values=core.readiness(core.primary(state)),list=document.querySelector('.tipe-readiness');
    if(list)list.innerHTML=values.map(c=>`<li class="${c.ok?'is-ready':''}"><span>${c.ok?'✓':'○'}</span>${c.label}</li>`).join('');
    const count=document.querySelector('#tipeReadinessCount');if(count)count.textContent=`${values.filter(c=>c.ok).length}/${values.length}`;const bar=document.querySelector('#tipeReadinessBar');if(bar)bar.style.width=Math.round(values.filter(c=>c.ok).length/values.length*100)+'%';
  }
  function ensure() {
    let p = core.primary(state), changed = false;
    if (!p) {
      p = {id:uid('p'),name:'Mon TIPE',description:'',theme:'',problematic:'',tipeStage:'subject',kind:'tipe',createdAt:new Date().toISOString()};
      (state.projects ||= []).push(p); changed = true;
    }
    if (state.tipeProjectId !== p.id) {state.tipeProjectId = p.id; changed = true;}
    if (changed) save();
    return p;
  }
  function persistData(values) { const p = ensure(); p.tipeData = {...core.data(p),...values}; return p; }
  function countMarkup(value,max) {
    const n = core.words(value);
    return `<span class="tipe-word-count ${n > max ? 'is-over' : ''}">${n} / ${max} mots${n > max ? ' · à raccourcir' : ''}</span>`;
  }
  function textarea(label,name,value,max,rows=3) {
    return `<div class="tipe-field"><label for="tipeField-${name}">${label}</label><textarea id="tipeField-${name}" name="${name}" rows="${rows}" maxlength="${max === 650 ? 12000 : 6000}" ${max ? `data-word-limit="${max}"` : ''}>${esc(value || '')}</textarea>${max ? countMarkup(value,max) : ''}</div>`;
  }
  function input(label,name,value,type='text',extra='') {
    return `<div class="tipe-field"><label for="tipeField-${name}">${label}</label><input id="tipeField-${name}" name="${name}" type="${type}" value="${esc(value || '')}" ${extra}></div>`;
  }
  function editSubject() {
    const p = ensure(), d = core.data(p);
    openModal('Mon sujet de TIPE',input('Titre du sujet','name',p.name === 'Mon TIPE' ? '' : p.name,'text','required maxlength="160" pattern=".*\\S.*"')
      + `<div class="tipe-form-grid">${input('Session du concours','session',d.session,'text','maxlength="30" placeholder="Ex. CNC 2027"')}${input('Thème annuel','theme',p.theme,'text','maxlength="160"')}</div>`
      + textarea('Problématique','problematic',p.problematic,50)
      + input('Professeur encadrant','supervisor',d.supervisor,'text','maxlength="160"')
      + input('Équipe et contribution personnelle','team',d.team,'text','maxlength="500"')
      + `<div class="tipe-form-grid"><label class="tipe-field"><span>Étape de travail</span><select name="tipeStage">${core.stages.map(([k,l]) => `<option value="${k}" ${p.tipeStage === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="tipe-field"><span>Discipline principale</span><select name="subjectId"><option value="">Transversal</option>${state.subjects.map(s => `<option value="${esc(s.id)}" ${s.id === p.subjectId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label></div>`,values => {
        const {session,supervisor,team,...subject} = values;
        Object.assign(p,subject,{name:subject.name.trim(),kind:'tipe'});
        persistData({session,supervisor,team});
      });
  }
  function editReference(id) {
    const d = core.data(ensure()), item = d.references.find(r => r.id === id) || {};
    openModal(id ? 'Modifier une référence' : 'Ajouter une référence',input('Titre','title',item.title,'text','required maxlength="240" pattern=".*\\S.*"')
      + input('Auteur, publication et année','author',item.author,'text','maxlength="300"')
      + input('Lien (facultatif)','url',item.url,'url','maxlength="2000"')
      + textarea('Ce que cette source apporte au TIPE','note',item.note,0),values => {
        const record = {...item,...values,url:safeURL(values.url)};
        if (id) d.references = d.references.map(r => r.id === id ? record : r);
        else d.references.push({...record,id:uid('ref')});
        persistData({references:d.references});
      });
  }
  function editJournal(id) {
    const d = core.data(ensure()), item = d.journal.find(r => r.id === id) || {date:todayISO(),kind:'experiment'};
    openModal(id ? 'Modifier une entrée du carnet' : 'Ajouter au carnet scientifique',input('Titre','title',item.title,'text','required maxlength="180" pattern=".*\\S.*"')
      + `<div class="tipe-form-grid">${input('Date','date',item.date,'date','required')}<label class="tipe-field"><span>Type de travail</span><select name="kind">${Object.entries(kindLabels).map(([k,l]) => `<option value="${k}" ${item.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>`
      + textarea('Question ou hypothèse','hypothesis',item.hypothesis,0)
      + textarea('Méthode, protocole ou modèle','method',item.method,0)
      + textarea('Résultats et observations','result',item.result,0)
      + textarea('Limites et prochaine décision','limits',item.limits,0),values => {
        const record = {...item,...values};
        if (id) d.journal = d.journal.map(r => r.id === id ? record : r);
        else d.journal.push({...record,id:uid('log')});
        persistData({journal:d.journal});
      });
  }
  function editDot(id,fromLog='') {
    const d = core.data(ensure()), log = d.journal.find(r => r.id === fromLog);
    const item = d.dot.find(r => r.id === id) || {date:log?.date || todayISO(),text:log ? `${log.title}. ${log.result || ''}`.trim() : ''};
    openModal(id ? 'Modifier une étape du DOT' : 'Déroulé opérationnel du TIPE',input('Date','date',item.date,'date','required')
      + textarea('Étape, résultat et décision','text',item.text,50),values => {
        const record = {...item,...values};
        if (id) d.dot = d.dot.map(r => r.id === id ? record : r);
        else d.dot.push({...record,id:uid('dot')});
        persistData({dot:d.dot});
      });
  }
  function editDocument(id) {
    const d = core.data(ensure()), item = d.documents.find(r => r.id === id) || {};
    openModal(id ? 'Modifier un document' : 'Ajouter un document',input('Nom du document','title',item.title,'text','required maxlength="180" pattern=".*\\S.*"')
      + input('Lien vers le document','url',item.url,'url','required maxlength="2000" placeholder="https://…"')
      + `<label class="tipe-field"><span>Contenu</span><select name="kind">${[['presentation','Présentation PDF'],['f2','Fiche F2'],['data','Mesures et résultats'],['code','Code / simulation'],['other','Autre document']].map(([k,l]) => `<option value="${k}" ${item.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`,values => {
        const record = {...item,...values,url:safeURL(values.url)};
        if (id) d.documents = d.documents.map(r => r.id === id ? record : r);
        else d.documents.push({...record,id:uid('doc')});
        persistData({documents:d.documents});
      });
    const url = document.querySelector('#modalForm').elements.url;
    const validate = () => url.setCustomValidity(safeURL(url.value) ? '' : 'Utilise un lien https:// ou http://.');
    url.addEventListener('input',validate); if (url.value) validate();
  }
  let tipeStep = null;
  function stepStatus(p,d,checks) {
    const ok = (...i) => i.every(n => checks[n]?.ok);
    return [
      {key:'subject',label:'Sujet',ok:ok(0),hint:'Thème et question'},
      {key:'journal',label:'Carnet',ok:d.journal.length > 0,hint:'Tes essais'},
      {key:'mcot',label:'MCOT',ok:ok(1,2,3,4),hint:'Fiche à rédiger'},
      {key:'dot',label:'DOT',ok:ok(5),hint:'Étapes clés'},
      {key:'oral',label:'Oral',ok:ok(6,7,8),hint:'Plan et documents'}
    ];
  }
  function section(id,title,action,body) {return `<section class="tipe-section" id="tipe-${id}"><div class="tipe-section-head"><h2>${title}</h2>${action || ''}</div>${body}</section>`;}
  function entryActions(collection,id,attribute) {return `<div class="tipe-inline-actions"><button class="link-btn" ${attribute}="${esc(id)}">Modifier</button><button class="link-btn" data-tipe-remove="${collection}:${esc(id)}">Retirer</button></div>`;}
  function render() {
    const p = ensure(), d = core.data(p), ids = core.ids(state);
    const tasks = state.tasks.filter(t => ids.has(t.projectId)), done = tasks.filter(t => t.done).length;
    const snap = window.PrepagoFocus?.snapshot() || {rows:[],ready:false};
    const sessions = snap.rows.filter(r => ids.has(r.project_id) && r.kind === 'work' && !r.deleted_at && ['completed','cancelled'].includes(r.status) && r.duration_seconds > 0);
    const seconds = sessions.reduce((n,r) => n + r.duration_seconds,0), checks = core.readiness(p);
    const nextTask = tasks.find(t => !t.done);
    const legacy = (state.projects || []).filter(x => x.id !== p.id && (x.description || x.problematic));
    const subject = section('subject','Sujet et direction','<button class="link-btn" data-tipe-subject>Modifier</button>',`<div class="tipe-subject-grid"><div><span class="tipe-caption">Thème</span><p>${esc(p.theme || 'À préciser avec ton encadrant')}</p><span class="tipe-caption">Encadrant</span><p>${esc(d.supervisor || 'À renseigner')}</p></div><div><span class="tipe-caption">Session</span><p>${esc(d.session || 'À préciser')}</p>${d.team ? `<span class="tipe-caption">Contribution</span><p>${esc(d.team)}</p>` : ''}</div></div>`);
    const mcot = section('mcot','MCOT','<span class="tipe-caption">Brouillon de préparation</span>',`<form id="tipeMCOTForm"><div class="tipe-form-grid">${textarea('Motivation du choix', 'motivation',d.motivation,50)}${textarea('Lien avec le thème','anchor',d.anchor,50)}</div>
      ${input('Positionnement thématique','positioning',d.positioning,'text','maxlength="500" placeholder="Ex. Physique · mécanique"')}
      <div class="tipe-form-grid">${input('5 mots-clés en français','keywordsFr',d.keywordsFr,'text','maxlength="400" placeholder="Séparés par des virgules" data-keywords="fr"')}${input('5 mots-clés en anglais','keywordsEn',d.keywordsEn,'text','maxlength="400" placeholder="Séparés par des virgules" data-keywords="en"')}</div>
      ${textarea('Bibliographie commentée','bibliography',d.bibliography,650,5)}${textarea('Objectifs personnels','objectives',d.objectives,100)}
      <div class="tipe-save-row"><span class="tipe-form-status" role="status">Les limites sont des repères de rédaction ; tu peux enregistrer un brouillon à raccourcir.</span><button type="submit" class="secondary-btn">Enregistrer la MCOT</button></div></form>
      <div class="tipe-section-head tipe-subhead"><h3>Références bibliographiques</h3><button class="link-btn" data-tipe-ref-new>+ Référence</button></div><p class="tipe-caption">${d.references.length} référence${d.references.length === 1 ? '' : 's'} · repère CNC : 2 à 10</p>
      ${d.references.map((r,i) => `<article class="tipe-reference"><span>[${i+1}]</span><div><strong>${esc(r.title)}</strong><p>${esc(r.author)}</p>${r.note ? `<p>${esc(r.note)}</p>` : ''}${safeURL(r.url) ? `<a href="${esc(safeURL(r.url))}" target="_blank" rel="noopener">Consulter la source</a>` : ''}</div>${entryActions('references',r.id,'data-tipe-ref')}</article>`).join('') || '<p class="tipe-empty">Conserve les articles, ouvrages et contacts qui fondent ton travail.</p>'}`);
    const journal = section('journal','Carnet scientifique','<button class="link-btn" data-tipe-log-new>+ Entrée</button>',d.journal.slice().sort((a,b) => b.date.localeCompare(a.date)).map(e => `<details class="tipe-log"><summary><span class="tipe-caption">${formatShort(e.date)} · ${kindLabels[e.kind] || 'Recherche'}</span><strong>${esc(e.title)}</strong></summary><div>${[['Hypothèse',e.hypothesis],['Méthode',e.method],['Résultats',e.result],['Limites et suite',e.limits]].filter(([,v]) => v).map(([l,v]) => `<h4>${l}</h4><p>${esc(v)}</p>`).join('')}<div class="tipe-inline-actions"><button class="link-btn" data-tipe-log="${esc(e.id)}">Modifier</button><button class="link-btn" data-tipe-log-dot="${esc(e.id)}">Synthétiser dans le DOT</button><button class="link-btn" data-tipe-remove="journal:${esc(e.id)}">Retirer</button></div></div></details>`).join('')
      || '<p class="tipe-empty">Note ce que tu testes, les résultats obtenus et les limites du modèle. Chaque entrée garde la trace de tes décisions.</p>');
    const dot = section('dot','Déroulé opérationnel','<button class="link-btn" data-tipe-dot-new>+ Étape du DOT</button>',`<p class="tipe-caption">Les faits marquants de ton travail, dans l’ordre chronologique. Repère CNC : 50 mots par étape.</p>${d.dot.slice().sort((a,b) => a.date.localeCompare(b.date)).map(e => `<article class="tipe-dot"><span>${formatShort(e.date)}</span><div><p>${esc(e.text)}</p>${countMarkup(e.text,50)}</div>${entryActions('dot',e.id,'data-tipe-dot')}</article>`).join('') || '<p class="tipe-empty">Choix du modèle, essai décisif, difficulté, changement de méthode, résultat : garde les étapes qui ont fait avancer la recherche.</p>'}`);
    const oral = section('oral','Présentation et oral','<button class="secondary-btn" data-tipe-rehearse>Répéter · 15 min</button>',`<div class="tipe-oral-guide"><strong>15 min d’exposé + 15 min d’échange</strong><span>Format candidat décrit dans la notice CNC 2026. Prévois une démonstration claire de ton apport personnel.</span></div><form id="tipeOralForm">${textarea('Plan de présentation','oralPlan',d.oralPlan,50)}${textarea('Questions du jury à préparer','oralQuestions',d.oralQuestions,0,4)}<div class="tipe-save-row"><span class="tipe-form-status" role="status"></span><button class="secondary-btn" type="submit">Enregistrer la préparation</button></div></form>
      <div class="tipe-section-head tipe-subhead"><h3>Documents de travail</h3><button class="link-btn" data-tipe-doc-new>+ Document</button></div><p class="tipe-caption">Liens vers tes fichiers. Repère CNC 2026 : présentation PDF, 5 Mo maximum ; F2 signée puis déposée sur le portail du concours.</p>
      ${d.documents.map(r => `<article class="tipe-document"><span>${uiIcon('cnc')}</span><div><strong>${esc(r.title)}</strong>${safeURL(r.url) ? `<a href="${esc(safeURL(r.url))}" target="_blank" rel="noopener">Ouvrir le document</a>` : '<span>Lien à compléter</span>'}</div>${entryActions('documents',r.id,'data-tipe-doc')}</article>`).join('') || '<p class="tipe-empty">Rassemble la présentation, la fiche F2, les mesures et les simulations.</p>'}
      <div class="tipe-checklist">${[['presentation','Présentation PDF vérifiée'],['f2','Fiche F2 signée'],['submitted','Documents déposés sur le portail CNC'],['validated','Validation administrative confirmée']].map(([key,label]) => `<label><input type="checkbox" data-tipe-check="${key}" ${d.checks[key] ? 'checked' : ''}>${label}</label>`).join('')}</div>`);
    const milestones = `<section class="tipe-rail-section"><div class="tipe-section-head"><h2>Jalons</h2>${uiIcon('calendar')}</div><p class="tipe-caption">Tes dates ajoutent les échéances au calendrier.</p>${core.milestones.map(([key,label]) => `<label class="tipe-milestone"><span>${label}</span><input type="date" aria-label="Échéance TIPE — ${label}" data-tipe-deadline="${key}" value="${esc(d.deadlines[key] || '')}"></label>`).join('')}</section>`;
    const ready = checks.filter(c => c.ok).length, pct = Math.round(ready / checks.length * 100);
    const steps = stepStatus(p,d,checks);
    if (!steps.some(x => x.key === tipeStep)) tipeStep = (steps.find(x => !x.ok) || steps[0]).key;
    const bodies = {subject,journal,mcot,dot,oral}, index = steps.findIndex(x => x.key === tipeStep), prev = steps[index-1], next = steps[index+1];
    const extras = `${d.removed.length ? `<details class="tipe-source-note"><summary>Éléments retirés (${d.removed.length})</summary>${d.removed.map(e => `<div class="tipe-removed-row"><span>${esc(e.record.title || e.record.text || 'Entrée retirée')}</span><button class="link-btn" data-tipe-restore="${esc(e.id)}">Restaurer</button></div>`).join('')}</details>` : ''}${legacy.length ? section('legacy','Notes reprises','',legacy.map(x => `<details class="tipe-log"><summary><strong>${esc(x.name)}</strong></summary><div><p>${esc(x.problematic || '')}</p><p>${esc(x.description || '')}</p></div></details>`).join('')) : ''}
      <details class="tipe-source-note"><summary>Repères et sources officielles</summary><p>Les livrables et limites affichés viennent de la notice CNC 2026. Vérifie la notice de ta session et les consignes de ton encadrant ; aucune date officielle n’est préremplie.</p><a href="${notice}" target="_blank" rel="noopener">Notice CNC 2026 · TIPE</a><a href="${themeSource}" target="_blank" rel="noopener">Thème 2026–2027 · Bulletin officiel français</a><p>Le thème publié en France est « Sobriété, efficacité, optimisation ». Confirme son application au CNC de ta session avant de le renseigner.</p></details>`;
    document.querySelector('#page').innerHTML = `<div class="tipe-workspace tipe-v2"><header class="tipe-header"><div><h1>${esc(p.name)}</h1></div><div class="tipe-inline-actions"><button class="secondary-btn" data-tipe-export>Exporter le dossier</button><button class="primary-btn" data-project-focus="${esc(p.id)}">Travailler sur mon TIPE</button></div></header>
      <section class="tipe-overview"><button class="tipe-question-card" data-tipe-subject><span class="tipe-caption">Ma problématique</span><strong class="${p.problematic ? '' : 'is-empty'}">${esc(p.problematic || 'Écris la question scientifique à laquelle ton TIPE répond.')}</strong><span class="tipe-question-meta">${esc(p.theme || 'Thème à préciser')} · ${esc(d.supervisor || 'Encadrant à renseigner')}</span></button>
        <div class="tipe-progress-card"><div class="tipe-progress-top"><strong id="tipeReadinessCount">${ready}/${checks.length}</strong><span>éléments du dossier prêts</span></div><span class="tipe-progress-bar"><span id="tipeReadinessBar" style="width:${pct}%"></span></span><div class="tipe-progress-facts"><span><b>${done}/${tasks.length}</b> étapes faites</span><span><b>${FocusData.duration(seconds)}</b> de travail</span></div></div></section>
      <nav class="tipe-steps" aria-label="Parcours du TIPE">${steps.map((x,i) => `<button type="button" class="${x.key === tipeStep ? 'is-active' : ''} ${x.ok ? 'is-done' : ''}" data-tipe-jump="${x.key}" aria-current="${x.key === tipeStep ? 'step' : 'false'}"><span class="tipe-step-dot" aria-hidden="true">${x.ok ? uiIcon('check') : i+1}</span><span class="tipe-step-text"><strong>${x.label}</strong><small>${x.ok ? 'Prêt' : x.hint}</small></span></button>`).join('')}</nav>
      <div class="tipe-workspace-grid"><div class="tipe-main">${bodies[tipeStep]}<div class="tipe-step-nav">${prev ? `<button class="secondary-btn" data-tipe-jump="${prev.key}">‹ ${prev.label}</button>` : '<span></span>'}${next ? `<button class="primary-btn" data-tipe-jump="${next.key}">Suivant : ${next.label} ›</button>` : ''}</div>${extras}</div>
      <aside class="tipe-rail"><section class="tipe-rail-section"><div class="tipe-section-head"><h2>Prochaine action</h2><button class="link-btn" data-project-task="${esc(p.id)}">+ Étape</button></div>${nextTask ? `<p class="tipe-next-title">${esc(nextTask.title)}</p><button class="secondary-btn" data-task-focus="${esc(nextTask.id)}">Travailler cette étape</button>` : '<p class="tipe-empty">Choisis une petite action concrète pour avancer.</p>'}<div class="tipe-task-list">${tasks.map(taskWorkspaceRow).join('')}</div></section>
      ${milestones}
      <section class="tipe-rail-section"><div class="tipe-section-head"><h2>Travail enregistré</h2><button class="link-btn" data-tipe-calendar>Calendrier réel</button></div>${sessions.slice().sort((a,b) => String(b.started_at).localeCompare(String(a.started_at))).slice(0,5).map(r => `<div class="tipe-session"><span>${formatShort(r.legacy_date || FocusData.iso(new Date(r.started_at)))}</span><div><strong>${esc(r.session_goal || 'Travail TIPE')}</strong><span>${r.status === 'completed' ? 'Terminée' : 'Interrompue'}</span></div><strong>${FocusData.duration(r.duration_seconds)}</strong></div>`).join('') || `<p class="tipe-empty">${snap.ready ? 'Tes sessions apparaîtront ici après enregistrement.' : 'Chargement des sessions…'}</p>`}</section></aside></div></div>`;
    bindDraft('#tipeMCOTForm',['motivation','anchor','positioning','keywordsFr','keywordsEn','bibliography','objectives']);
    bindDraft('#tipeOralForm',['oralPlan','oralQuestions']);
  }
  function bindDraft(selector,fields) {
    const form = document.querySelector(selector);
    if (!form) return;
    form.onsubmit = event => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(form));
      persistData(Object.fromEntries(fields.map(k => [k,values[k] || ''])));clearTimeout(draftTimer);pendingDraft=null;save();updateReadiness();
      form.querySelector('.tipe-form-status').textContent = 'Brouillon enregistré'; showToast('Brouillon enregistré');
    };
  }
  function exportDossier() {
    const p = ensure(), d = core.data(p);
    const lines = [`# ${p.name}`,`Session : ${d.session || 'À préciser'}`,`Thème : ${p.theme || 'À préciser'}`,`Encadrant : ${d.supervisor || 'À préciser'}`,`Contribution : ${d.team || ''}`,
      '## Problématique',p.problematic || '',...Object.entries({Motivation:d.motivation,Ancrage:d.anchor,Positionnement:d.positioning,'Mots-clés FR':d.keywordsFr,'Mots-clés EN':d.keywordsEn,'Bibliographie commentée':d.bibliography,Objectifs:d.objectives}).flatMap(([k,v]) => [`## ${k}`,v]),
      '## Références',...d.references.map((r,i) => `[${i+1}] ${r.title} — ${r.author || ''}\n${r.url || ''}\n${r.note || ''}`),
      '## Carnet scientifique',...d.journal.slice().sort((a,b) => a.date.localeCompare(b.date)).map(e => `### ${e.date} — ${e.title}\nHypothèse : ${e.hypothesis || ''}\nMéthode : ${e.method || ''}\nRésultats : ${e.result || ''}\nLimites : ${e.limits || ''}`),
      '## DOT',...d.dot.slice().sort((a,b) => a.date.localeCompare(b.date)).map(e => `${e.date} — ${e.text}`),'## Plan oral',d.oralPlan,'## Questions à préparer',d.oralQuestions,'## Documents',...d.documents.map(r => `${r.title} : ${r.url}`)];
    const url = URL.createObjectURL(new Blob([lines.join('\n\n')],{type:'text/markdown;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = 'mon-tipe.md'; a.hidden = true; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
    showToast('Dossier préparé pour le téléchargement');
  }
  document.addEventListener('input',e => {
    if (e.target.matches('[data-word-limit]')) {const max = Number(e.target.dataset.wordLimit); const counter = e.target.nextElementSibling; if (counter) {counter.textContent = `${core.words(e.target.value)} / ${max} mots${core.words(e.target.value) > max ? ' · à raccourcir' : ''}`; counter.classList.toggle('is-over',core.words(e.target.value) > max);}}
    const form=e.target.closest('#tipeMCOTForm,#tipeOralForm');
    if(form){persistData(Object.fromEntries(new FormData(form)));pendingDraft={account:state,form};form.querySelector('.tipe-form-status').textContent='Enregistrement du brouillon…';clearTimeout(draftTimer);draftTimer=setTimeout(flushDraft,700);}
  });
  document.addEventListener('change',e => {
    if(!e.target.dataset.tipeCheck&&!e.target.dataset.tipeDeadline)return;
    const d = core.data(ensure());
    if (e.target.dataset.tipeCheck) {d.checks = {...d.checks,[e.target.dataset.tipeCheck]:e.target.checked};persistData({checks:d.checks});save();updateReadiness();}
    if (e.target.dataset.tipeDeadline) {const key=e.target.dataset.tipeDeadline,p=ensure();d.deadlines={...d.deadlines,[key]:e.target.value};persistData({deadlines:d.deadlines});core.upsertMilestone(state,p,key,e.target.value,() => uid('e'));save();showToast(e.target.value ? 'Jalon ajouté au calendrier' : 'Date du jalon retirée');}
  });
  document.addEventListener('click',e => {
    const b=e.target.closest('button');if(!b)return;const v=b.dataset;
    if(v.tipeJump&&currentPage==='projects'){tipeStep=v.tipeJump;render();const nav=document.querySelector('.tipe-steps');if(nav&&nav.getBoundingClientRect().top<0)nav.scrollIntoView({block:'start'});}
    if(v.tipeRemove){const [collection,id]=v.tipeRemove.split(':');if(core.removeEntry(ensure(),collection,id)){save();render();showToast('Élément retiré. Il reste restaurable en bas du TIPE.');}}
    if(v.tipeRestore&&core.restoreEntry(ensure(),v.tipeRestore)){save();render();showToast('Élément restauré');}
    if ('tipeSubject' in v) editSubject();
    if ('tipeRefNew' in v || v.tipeRef) editReference(v.tipeRef);
    if ('tipeLogNew' in v || v.tipeLog) editJournal(v.tipeLog);
    if ('tipeDotNew' in v || v.tipeDot || v.tipeLogDot) editDot(v.tipeDot,v.tipeLogDot);
    if ('tipeDocNew' in v || v.tipeDoc) editDocument(v.tipeDoc);
    if ('tipeRehearse' in v) {const p=ensure();prepareFocus({projectId:p.id,subject:state.subjects.find(s => s.id === p.subjectId)?.name || '',title:'Répétition de l’oral TIPE',minutes:15});}
    if ('tipeCalendar' in v) window.PrepagoCalendar?.open({mode:'real',tipe:true});
    if ('tipeExport' in v) exportDossier();
  });
  window.PrepagoTipe = {render,ensure,editSubject};
  document.addEventListener('click',e=>{if(e.target.closest('button,a'))flushDraft();},true);
  window.addEventListener('pagehide',flushDraft);
  window.addEventListener('prepago:state-replaced',()=>{clearTimeout(draftTimer);pendingDraft=null;tipeStep=null;});
})();
