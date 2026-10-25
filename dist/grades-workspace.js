/* Colles et DS: plan an exam with the chapters it covers, follow its preparation through
   Matières, then grade it. Persisted with the existing account state and calendar. */
(() => {
  const core = window.PrepagoGradesCore;
  let filterSubject = '', filterKind = '';
  const fmt = n => n === null || n === undefined ? '—' : Number(n).toLocaleString('fr-FR', {maximumFractionDigits: 2});
  const signed = n => n === null ? '' : `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n))}`;
  const subjectOf = id => state.subjects.find(s => s.id === id);
  const chapterOf = (subject, id) => subject?.chapters?.find(c => c.id === id);
  const titleOf = g => `${core.kindLabel(g.kind)} · ${subjectOf(g.subjectId)?.name || 'Matière supprimée'}`;
  const longDate = g => new Intl.DateTimeFormat('fr-FR', {weekday: 'short', day: 'numeric', month: 'short'}).format(new Date(g.date + 'T12:00:00')) + (g.time ? ` · ${g.time.replace(/^0/, '').replace(':', 'h')}` : '');
  function countdown(date) {
    const d = core.daysUntil(date);
    return d === 0 ? 'aujourd’hui' : d === 1 ? 'demain' : d > 1 ? `dans ${d} jours` : `il y a ${-d} jour${d < -1 ? 's' : ''}`;
  }
  function chapterNames(g, max = 3) {
    const subject = subjectOf(g.subjectId), names = core.chapterIdsOf(g).map(id => chapterOf(subject, id)?.name).filter(Boolean);
    if (!names.length) return 'Tout le programme';
    return names.slice(0, max).join(', ') + (names.length > max ? ` +${names.length - max}` : '');
  }
  function revisionSeconds(g) {
    const ids = new Set(core.chapterIdsOf(g)), rows = window.PrepagoFocus?.snapshot()?.rows || [];
    return rows.filter(r => ids.has(r.chapter_id) && r.kind === 'work' && !r.deleted_at && ['completed', 'cancelled'].includes(r.status) && r.duration_seconds > 0 && (!g.createdAt || String(r.started_at) >= g.createdAt))
      .reduce((n, r) => n + r.duration_seconds, 0);
  }

  pageNames.grades = 'Colles et DS';
  iconFiles.grades = 'clipboard-check';
  const nav = document.createElement('button');
  nav.className = 'nav-item'; nav.dataset.page = 'grades';
  nav.innerHTML = '<span class="icon"></span>Colles et DS';
  document.querySelector('[data-page="cnc"]').after(nav);

  /* ---- Form ------------------------------------------------------------------------------ */
  function chapterChecklist(subjectId, selected = []) {
    const chapters = subjectOf(subjectId)?.chapters || [];
    if (!chapters.length) return '<p class="grades-muted">Cette matière n’a pas encore de chapitres dans Matières.</p>';
    const groups = [['sup', 'Sup'], ['spe', 'Spé'], ['', 'Autres chapitres']].map(([level, label]) => [label, chapters.filter(c => level ? c.studyLevel === level : !['sup', 'spe'].includes(c.studyLevel))]).filter(([, list]) => list.length);
    return groups.map(([label, list]) => `${groups.length > 1 ? `<p class="grades-chapter-group">${label}</p>` : ''}${list.map(c => `<label class="grades-chapter-option"><input type="checkbox" name="chapterIds" value="${esc(c.id)}" ${selected.includes(c.id) ? 'checked' : ''}><span>${esc(c.name)}</span></label>`).join('')}`).join('');
  }
  function edit(id, preset = {}) {
    const grades = core.list(state), g = grades.find(x => x.id === id);
    if (!g && grades.length >= core.LIMIT) {showToast(`Limite de ${core.LIMIT} épreuves atteinte. Supprime d’anciennes épreuves pour en ajouter.`); return;}
    if (!state.subjects.length) {showToast('Ajoute d’abord une matière dans Matières.'); return;}
    const v = g ? {...g, chapterIds: core.chapterIdsOf(g)} : {kind: 'ds', subjectId: filterSubject || state.subjects[0].id, chapterIds: [], date: '', time: '', score: null, outOf: 20, classAverage: null, note: '', ...preset};
    openModal(g ? 'Modifier l’épreuve' : 'Nouvelle colle ou DS', `<div class="grades-form">
      <div class="settings-grid"><div class="field"><label for="gradeKind">Épreuve</label><select id="gradeKind" name="kind">${core.kinds.map(([k, l]) => `<option value="${k}" ${k === v.kind ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="gradeSubject">Matière</label><select id="gradeSubject" name="subjectId" required>${state.subjects.map(s => `<option value="${esc(s.id)}" ${s.id === v.subjectId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div></div>
      <div class="settings-grid"><div class="field"><label for="gradeDate">Date</label><input id="gradeDate" name="date" type="date" required value="${esc(v.date)}"></div>
      <div class="field"><label for="gradeTime">Heure (facultative)</label><input id="gradeTime" name="time" type="time" value="${esc(v.time || '')}"></div></div>
      <fieldset class="grades-chapters"><legend>Chapitres au programme <small>Facultatif · Prepago suit ta préparation de ces chapitres dans Matières</small></legend><div class="grades-chapter-list" id="gradeChapters">${chapterChecklist(v.subjectId, v.chapterIds)}</div></fieldset>
      <p class="grades-form-later">Tu saisiras ta note ici après l’épreuve.</p>
      <div class="grades-form-result"><div class="grades-form-scores"><div class="field"><label for="gradeScore">Note (facultative)</label><input id="gradeScore" name="score" type="number" inputmode="decimal" min="0" max="${v.outOf}" step="any" value="${core.isGraded(v) ? v.score : ''}"></div>
      <div class="field"><label for="gradeOutOf">Sur</label><input id="gradeOutOf" name="outOf" type="number" inputmode="decimal" required min="1" max="100" step="any" value="${v.outOf}"></div>
      <div class="field"><label for="gradeAverage">Moyenne de la classe (facultatif)</label><input id="gradeAverage" name="classAverage" type="number" inputmode="decimal" min="0" max="${v.outOf}" step="any" value="${v.classAverage ?? ''}"></div></div>
      <div class="field"><label for="gradeNote">Ce qui a coincé (facultatif)</label><textarea id="gradeNote" name="note" rows="3" maxlength="${core.NOTE_MAX}" placeholder="Ex. démonstration du théorème spectral oubliée, erreurs de signe en fin d’exercice">${esc(v.note || '')}</textarea></div></div></div>`, () => {});
    const form = document.querySelector('#modalForm');
    const sync = () => {
      const upcoming = !!form.elements.date.value && core.status({date: form.elements.date.value, time: form.elements.time.value, score: null}) === 'upcoming';
      form.querySelector('.grades-form-result').hidden = upcoming || !form.elements.date.value;
      form.querySelector('.grades-form-later').hidden = !upcoming;
    };
    sync();
    form.addEventListener('input', sync); form.addEventListener('change', sync);
    form.elements.subjectId.onchange = () => {form.querySelector('#gradeChapters').innerHTML = chapterChecklist(form.elements.subjectId.value);};
    form.elements.outOf.oninput = () => {const max = core.number(form.elements.outOf.value); if (max > 0) {form.elements.score.max = max; form.elements.classAverage.max = max;}};
    form.onsubmit = e => {
      e.preventDefault();
      const data = new FormData(form), record = core.normalize({...Object.fromEntries(data), chapterIds: data.getAll('chapterIds')}, g);
      if (record.error) {showToast(record.error); return;}
      const saved = g ? record : {...record, id: uid('g'), createdAt: new Date().toISOString()};
      state.grades = g ? grades.map(x => x.id === id ? saved : x) : [...grades, saved];
      core.upsertEvent(state, saved, titleOf(saved), () => uid('e'));
      closeModal(); save(); render();
      const st = core.status(saved);
      showToast(st === 'upcoming' ? 'Ajouté au calendrier. Suis ta préparation dans Colles et DS.' : st === 'toGrade' ? 'Épreuve enregistrée. Ajoute ta note quand tu l’as.' : 'Note enregistrée');
    };
  }
  function grade(id, score) {
    const g = core.list(state).find(x => x.id === id);
    if (!g) return;
    const record = core.normalize({...g, score, chapterIds: core.chapterIdsOf(g)}, g);
    if (record.error) {showToast(record.error); return;}
    if (!core.isGraded(record)) {showToast('Saisis ta note.'); return;}
    state.grades = core.list(state).map(x => x.id === id ? record : x);
    save(); render(); showToast('Note enregistrée');
  }
  function remove(id) {
    const g = core.list(state).find(x => x.id === id);
    if (!g || !confirm('Supprimer cette épreuve ? Elle sera aussi retirée du calendrier.')) return;
    core.removeEvent(state, g);
    state.grades = core.list(state).filter(x => x.id !== id);
    save(); render(); showToast('Épreuve supprimée');
  }

  /* ---- Links to Matières, Tâches and Concentration ----------------------------------------- */
  function openChapter(subjectId, chapterId) {
    currentPage = 'subjects';
    openLearningChapter(subjectId, chapterId);
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === 'subjects'));
    render();
    document.querySelector(`[data-chapter-card="${CSS.escape(chapterId)}"]`)?.scrollIntoView({block: 'center'});
  }
  function revise(subject, chapter, g = null) {
    prepareFocus({subject: subject.name, chapterId: chapter.id, title: g ? `${core.kindLabel(g.kind)} · ${chapter.name}` : `Reprendre : ${chapter.name}`, minutes: 45, eventId: g?.eventId || ''});
  }
  function planRevision(subject, chapter) {
    taskEditor();
    const form = document.querySelector('#modalForm');
    form.elements.title.value = `Reprendre : ${chapter.name}`;
    if (form.elements.subject) {form.elements.subject.value = subject.name; form.elements.subject.dispatchEvent(new Event('change'));}
  }

  /* ---- Page ------------------------------------------------------------------------------ */
  function dots(units) { return `<span class="grades-dots" aria-label="${units} étape${units > 1 ? 's' : ''} sur ${core.STEPS}">${Array.from({length: core.STEPS}, (_, i) => `<i class="${i < units ? 'is-on' : ''}"></i>`).join('')}</span>`; }
  function sparkline(points, color) {
    if (points.length < 2) return '<span class="grades-spark is-empty" aria-hidden="true"></span>';
    const w = 120, h = 32, x = i => (i / (points.length - 1) * (w - 4) + 2).toFixed(1), y = v => (h - 2 - Math.max(0, Math.min(20, v)) / 20 * (h - 4)).toFixed(1);
    return `<svg class="grades-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><line x1="0" x2="${w}" y1="${y(core.WEAK)}" y2="${y(core.WEAK)}" class="grades-spark-mid"/><polyline fill="none" stroke="${esc(color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${points.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/><circle cx="${x(points.length - 1)}" cy="${y(points[points.length - 1])}" r="3" fill="${esc(color)}"/></svg>`;
  }
  function upcomingCard(g) {
    const p = core.preparation(state, g, LEARNING_STEPS), seconds = revisionSeconds(g);
    const prep = p.chapters.length ? `<div class="grades-prep"><div class="grades-prep-top"><span>Préparation</span><strong>${p.percent} %</strong></div><span class="grades-prep-bar"><span style="width:${p.percent}%"></span></span><small>${p.ready} chapitre${p.ready > 1 ? 's' : ''} sur ${p.chapters.length} terminé${p.ready > 1 ? 's' : ''} dans Matières${seconds ? ` · ${FocusData.duration(seconds)} de révision` : ''}</small></div>
      <ul class="grades-exam-chapters">${p.chapters.map(c => `<li><button type="button" class="grades-chapter-link" data-grade-open="${esc(g.subjectId)}|${esc(c.chapter.id)}">${esc(c.chapter.name)}</button>${dots(c.units)}<span class="grades-chapter-next ${c.ready ? 'is-ready' : ''}">${c.ready ? 'Terminé' : `Prochaine étape : ${c.next ? c.next.label : 'Terminer'}`}</span></li>`).join('')}</ul>`
      : `<div class="grades-prep-empty"><p>Choisis les chapitres au programme : Prepago suivra ta préparation dans Matières.</p><button class="link-btn" data-grade-edit="${esc(g.id)}">Choisir les chapitres</button></div>`;
    return `<article class="card grades-exam" data-grade-card="${esc(g.id)}"><header class="grades-exam-head"><div><span class="grades-kind">${core.kindLabel(g.kind)}</span><strong>${esc(subjectOf(g.subjectId)?.name || 'Matière supprimée')}</strong><span class="grades-when">${longDate(g)}</span></div><span class="grades-countdown ${core.daysUntil(g.date) <= 2 ? 'is-soon' : ''}">${countdown(g.date)}</span></header>
      ${prep}<div class="grades-exam-actions">${p.todo ? `<button class="primary-btn" data-grade-revise="${esc(g.id)}|${esc(p.todo.chapter.id)}">Réviser : ${esc(p.todo.chapter.name)}</button>` : ''}<button class="secondary-btn" data-grade-edit="${esc(g.id)}">Modifier</button><button class="link-btn" data-grade-delete="${esc(g.id)}">Supprimer</button></div></article>`;
  }
  function toGradeCard(g) {
    return `<article class="card grades-exam is-due" data-grade-card="${esc(g.id)}"><header class="grades-exam-head"><div><span class="grades-kind">${core.kindLabel(g.kind)}</span><strong>${esc(subjectOf(g.subjectId)?.name || 'Matière supprimée')}</strong><span class="grades-when">${longDate(g)} · ${esc(chapterNames(g))}</span></div><span class="grades-countdown">${countdown(g.date)}</span></header>
      <form class="grades-quick" data-grade-quick="${esc(g.id)}"><label for="gradeQuick-${esc(g.id)}">Ma note</label><input id="gradeQuick-${esc(g.id)}" name="score" type="number" inputmode="decimal" min="0" max="${g.outOf}" step="any" required><span>/ ${fmt(g.outOf)}</span><button class="primary-btn" type="submit">Enregistrer</button><button type="button" class="link-btn" data-grade-edit="${esc(g.id)}">Ajouter des détails</button><button type="button" class="link-btn" data-grade-delete="${esc(g.id)}">Supprimer</button></form></article>`;
  }
  function gradeRow(g) {
    const low = core.on20(g) < core.WEAK;
    return `<article class="grades-row" data-grade-row="${esc(g.id)}"><span class="grades-date">${formatShort(g.date)}</span><span class="grades-kind">${core.kindLabel(g.kind)}</span>
      <div class="grades-what"><strong>${esc(subjectOf(g.subjectId)?.name || 'Matière supprimée')}</strong><span>${esc(chapterNames(g))}</span>${g.note ? `<p>${esc(g.note)}</p>` : ''}</div>
      <div class="grades-score ${low ? 'is-low' : ''}"><strong>${fmt(g.score)}<small> / ${fmt(g.outOf)}</small></strong>${typeof g.classAverage === 'number' ? `<span>Classe : ${fmt(g.classAverage)}</span>` : ''}</div>
      <div class="grades-row-actions"><button class="link-btn" data-grade-edit="${esc(g.id)}">Modifier</button><button class="link-btn" data-grade-delete="${esc(g.id)}">Supprimer</button></div></article>`;
  }
  function results() {
    const sum = core.summary(state);
    if (!sum.count) return `<section class="grades-section"><h2>Résultats</h2><div class="card grades-placeholder"><p>Tes moyennes par matière, ta tendance et les chapitres à reprendre apparaîtront ici après ta première note.</p></div></section>`;
    if (filterSubject && !subjectOf(filterSubject)) filterSubject = '';
    const subjects = core.bySubject(state), weak = core.weakChapters(state);
    const shown = core.graded(state).reverse().filter(g => (!filterSubject || g.subjectId === filterSubject) && (!filterKind || g.kind === filterKind));
    const stat = (label, value, detail = '') => `<div class="card grades-stat"><span>${label}</span><strong>${value}</strong>${detail ? `<small>${detail}</small>` : ''}</div>`;
    const trendText = sum.trend === null ? '—' : `${signed(sum.trend)} pt${Math.abs(sum.trend) >= 2 ? 's' : ''}`;
    return `<section class="grades-section"><h2>Résultats</h2>
      <div class="grades-summary">${stat('Moyenne générale', `${fmt(sum.average)}<small> / 20</small>`)}${stat('Épreuves notées', sum.count)}${stat('Tendance', trendText, sum.trend === null ? 'Il faut au moins 4 notes' : '3 dernières notes comparées aux 3 précédentes')}</div>
      <div class="grades-grid"><div class="grades-main">
        <section class="card grades-subjects"><h3>Par matière</h3>${subjects.map(r => `<button type="button" class="grades-subject ${filterSubject === r.subject.id ? 'is-active' : ''}" data-grade-filter="${esc(r.subject.id)}" aria-pressed="${filterSubject === r.subject.id}"><span class="grades-dot" style="background:${esc(r.subject.color || '#0A5CFF')}"></span><span class="grades-subject-name"><strong>${esc(r.subject.name)}</strong><small>${r.count} note${r.count > 1 ? 's' : ''}${r.gap === null ? '' : ` · ${signed(r.gap)} vs classe`}</small></span>${sparkline(r.points, r.subject.color || '#0A5CFF')}<span class="grades-subject-avg ${r.average < core.WEAK ? 'is-low' : ''}">${fmt(r.average)}<small> / 20</small></span></button>`).join('')}</section>
        <section class="card grades-history"><div class="grades-history-head"><h3>Historique</h3><div class="grades-filters"><label><span class="sr-only">Matière</span><select data-grade-subject-filter><option value="">Toutes les matières</option>${state.subjects.map(s => `<option value="${esc(s.id)}" ${s.id === filterSubject ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label><label><span class="sr-only">Épreuve</span><select data-grade-kind-filter><option value="">Toutes les épreuves</option>${core.kinds.map(([k, l]) => `<option value="${k}" ${k === filterKind ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div></div>
          <div class="grades-list">${shown.map(gradeRow).join('') || '<p class="grades-muted">Aucune note pour ces filtres.</p>'}</div></section>
      </div><aside class="grades-rail"><section class="card grades-weak"><h3>Chapitres à reprendre</h3>${weak.length ? weak.map(w => `<article class="grades-weak-row"><div><button type="button" class="grades-chapter-link" data-grade-open="${esc(w.subject.id)}|${esc(w.chapter.id)}">${esc(w.chapter.name)}</button><span>${esc(w.subject.name)} · ${core.kindLabel(w.last.kind)} du ${formatShort(w.last.date)} : ${fmt(core.round(core.on20(w.last)))} / 20</span></div><div class="grades-weak-actions"><button class="secondary-btn" data-grade-plan="${esc(w.subject.id)}|${esc(w.chapter.id)}">Planifier</button><button class="link-btn" data-grade-revise-chapter="${esc(w.subject.id)}|${esc(w.chapter.id)}">Réviser maintenant</button></div></article>`).join('') : `<p class="grades-muted">Aucun chapitre dont la dernière note est sous ${core.WEAK}/20.</p>`}</section></aside></div></section>`;
  }
  function renderGrades() {
    if (core.syncFromEvents(state)) save();
    const all = core.sorted(core.list(state)), upcoming = all.filter(g => core.status(g) === 'upcoming'), due = all.filter(g => core.status(g) === 'toGrade').reverse();
    const preps = upcoming.map(g => core.preparation(state, g, LEARNING_STEPS).percent).filter(p => p !== null);
    const step = (n, title, text, fact) => `<li><span class="grades-how-n">${n}</span><div><strong>${title}</strong><p>${text}</p><span class="grades-how-fact">${fact}</span></div></li>`;
    document.querySelector('#page').innerHTML = `<div class="grades-page"><header class="section-head page-header"><div><h1>Colles et DS</h1><p>Prépare tes épreuves, puis suis tes notes.</p></div><button class="primary-btn" data-grade-new>+ Colle ou DS</button></header>
      <ol class="card grades-how" aria-label="Comment ça marche">
        ${step(1, 'Planifie', 'Ajoute la date et, si tu veux, les chapitres au programme. L’épreuve s’ajoute au calendrier.', `${upcoming.length} à venir`)}
        ${step(2, 'Prépare', 'Avance ces chapitres dans Matières : Cours, Résumé, Exercices. Prepago calcule ta préparation.', preps.length ? `Préparation moyenne : ${Math.round(preps.reduce((a, b) => a + b, 0) / preps.length)} %` : 'Aucun chapitre à suivre')}
        ${step(3, 'Note', 'Après l’épreuve, saisis ta note. Elle s’affiche sur les chapitres dans Matières.', due.length ? `${due.length} à noter` : `${core.graded(state).length} notée${core.graded(state).length > 1 ? 's' : ''}`)}
      </ol>
      ${due.length ? `<section class="grades-section"><h2>À noter <span class="grades-count">${due.length}</span></h2><div class="grades-cards">${due.map(toGradeCard).join('')}</div></section>` : ''}
      <section class="grades-section"><h2>À venir${upcoming.length ? ` <span class="grades-count">${upcoming.length}</span>` : ''}</h2>${upcoming.length ? `<div class="grades-cards">${upcoming.map(upcomingCard).join('')}</div>` : '<div class="card grades-placeholder"><p>Aucune colle ni DS prévu. Ajoute ta prochaine épreuve pour suivre sa préparation.</p><button class="primary-btn" data-grade-new>+ Colle ou DS</button></div>'}</section>
      ${results()}</div>`;
  }

  /* Chapter cards in Matières show what colles and DS say about the chapter. */
  function decorateChapters() {
    const subject = state.subjects.find(s => s.id === learningSubjectId);
    if (!subject) return;
    document.querySelectorAll('[data-chapter-card]').forEach(card => {
      const chapter = subject.chapters.find(c => c.id === card.dataset.chapterCard);
      if (!chapter || card.querySelector('.chapter-grades')) return;
      const {last, next, weak} = core.chapterStatus(state, chapter.id);
      const lead = next ? `${core.kindLabel(next.kind)} ${countdown(next.date)}` : last ? `Dernière note : ${fmt(core.round(core.on20(last)))}/20` : 'Colles et DS';
      const rest = next ? (last ? `Dernière note : ${fmt(core.round(core.on20(last)))}/20 · ${weak ? 'à revoir' : 'solide'}` : '') : last ? (weak ? 'à revoir' : 'solide') : 'Aucune épreuve sur ce chapitre';
      const html = `<div class="chapter-grades ${weak ? 'is-weak' : ''}"><button type="button" class="chapter-grades-info" data-go="grades"><strong>${esc(lead)}</strong>${rest ? `<span>${esc(rest)}</span>` : ''}</button><button type="button" class="link-btn" data-grade-chapter-new="${esc(subject.id)}|${esc(chapter.id)}">+ Colle ou DS</button></div>`;
      const steps = card.querySelector('.chapter-steps');
      if (steps) steps.insertAdjacentHTML('afterend', html); else card.insertAdjacentHTML('beforeend', html);
    });
  }
  const baseSubjects = renderSubjects;
  renderSubjects = function (...args) {const result = baseSubjects(...args); decorateChapters(); return result;};

  const baseRender = render;
  render = function () {
    if (currentPage !== 'grades') return baseRender();
    window.PrepagoFocus?.leaveImmersive();
    renderGrades();
    document.body.dataset.page = 'grades';
    document.body.classList.remove('focus-cockpit-immersive');
    document.querySelectorAll('.nav-item').forEach(n => {n.classList.toggle('active', n.dataset.page === 'grades'); if (n.dataset.page === 'grades') n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');});
    refreshIcons(); updateSidebar();
  };
  const pair = value => {const [s, c] = String(value).split('|'); const subject = subjectOf(s); return {subject, chapter: chapterOf(subject, c)};};
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if ('gradeNew' in d) edit();
    if (d.gradeEdit) edit(d.gradeEdit);
    if (d.gradeDelete) remove(d.gradeDelete);
    if (d.gradeOpen) {const [s, c] = d.gradeOpen.split('|'); openChapter(s, c);}
    if (d.gradeChapterNew) {const [s, c] = d.gradeChapterNew.split('|'); edit(null, {subjectId: s, chapterIds: [c]});}
    if (d.gradeRevise) {const [id, c] = d.gradeRevise.split('|'), g = core.list(state).find(x => x.id === id), subject = g && subjectOf(g.subjectId), chapter = chapterOf(subject, c); if (chapter) revise(subject, chapter, g);}
    if (d.gradeReviseChapter) {const {subject, chapter} = pair(d.gradeReviseChapter); if (chapter) revise(subject, chapter);}
    if (d.gradePlan) {const {subject, chapter} = pair(d.gradePlan); if (chapter) planRevision(subject, chapter);}
    if (d.gradeFilter) {filterSubject = filterSubject === d.gradeFilter ? '' : d.gradeFilter; render();}
  });
  document.addEventListener('submit', e => {
    if (!e.target.matches('[data-grade-quick]')) return;
    e.preventDefault(); grade(e.target.dataset.gradeQuick, e.target.elements.score.value);
  });
  document.addEventListener('change', e => {
    if (e.target.matches('[data-grade-subject-filter]')) {filterSubject = e.target.value; render();}
    if (e.target.matches('[data-grade-kind-filter]')) {filterKind = e.target.value; render();}
  });
  window.addEventListener('prepago:state-replaced', () => {filterSubject = ''; filterKind = '';});
  window.PrepagoGrades = {render: renderGrades, edit};
})();
