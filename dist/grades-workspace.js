/* Colles et DS: grades logged by the student, persisted with the existing account state. */
(() => {
  const core = window.PrepagoGradesCore;
  let filterSubject = '', filterKind = '';
  const fmt = n => n === null || n === undefined ? '—' : Number(n).toLocaleString('fr-FR', {maximumFractionDigits: 2});
  const signed = n => n === null ? '' : `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n))}`;
  const subjectOf = id => state.subjects.find(s => s.id === id);
  const chapterOf = (subject, id) => subject?.chapters?.find(c => c.id === id);

  pageNames.grades = 'Colles et DS';
  iconFiles.grades = 'clipboard-check';
  const nav = document.createElement('button');
  nav.className = 'nav-item'; nav.dataset.page = 'grades';
  nav.innerHTML = '<span class="icon"></span>Colles et DS';
  document.querySelector('[data-page="cnc"]').after(nav);

  function chapterOptions(subjectId, selected = '') {
    const chapters = subjectOf(subjectId)?.chapters || [];
    return `<option value="">Tout le programme</option>${chapters.map(c => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}`;
  }
  function edit(id) {
    const grades = core.list(state), g = grades.find(x => x.id === id);
    if (!g && grades.length >= core.LIMIT) {showToast(`Limite de ${core.LIMIT} notes atteinte. Supprime d’anciennes notes pour en ajouter.`); return;}
    if (!state.subjects.length) {showToast('Ajoute d’abord une matière dans Mes matières.'); return;}
    const v = g || {kind: 'colle', subjectId: filterSubject || state.subjects[0].id, chapterId: '', date: todayISO(), score: '', outOf: 20, classAverage: null, note: ''};
    openModal(g ? 'Modifier la note' : 'Nouvelle note', `<div class="grades-form">
      <div class="settings-grid"><div class="field"><label for="gradeKind">Épreuve</label><select id="gradeKind" name="kind">${core.kinds.map(([k, l]) => `<option value="${k}" ${k === v.kind ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="gradeDate">Date</label><input id="gradeDate" name="date" type="date" required max="${todayISO()}" value="${esc(v.date)}"></div></div>
      <div class="settings-grid"><div class="field"><label for="gradeSubject">Matière</label><select id="gradeSubject" name="subjectId" required>${state.subjects.map(s => `<option value="${esc(s.id)}" ${s.id === v.subjectId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="gradeChapter">Chapitre</label><select id="gradeChapter" name="chapterId">${chapterOptions(v.subjectId, v.chapterId)}</select></div></div>
      <div class="grades-form-scores"><div class="field"><label for="gradeScore">Note</label><input id="gradeScore" name="score" type="number" inputmode="decimal" required min="0" max="${v.outOf}" step="any" value="${v.score === '' ? '' : v.score}"></div>
      <div class="field"><label for="gradeOutOf">Sur</label><input id="gradeOutOf" name="outOf" type="number" inputmode="decimal" required min="1" max="100" step="any" value="${v.outOf}"></div>
      <div class="field"><label for="gradeAverage">Moyenne de la classe (facultatif)</label><input id="gradeAverage" name="classAverage" type="number" inputmode="decimal" min="0" max="${v.outOf}" step="any" value="${v.classAverage ?? ''}"></div></div>
      <div class="field"><label for="gradeNote">Ce qui a coincé (facultatif)</label><textarea id="gradeNote" name="note" rows="3" maxlength="${core.NOTE_MAX}" placeholder="Ex. démonstration du théorème spectral oubliée, erreurs de signe en fin d’exercice">${esc(v.note)}</textarea></div></div>`, () => {});
    const form = document.querySelector('#modalForm');
    form.elements.subjectId.onchange = () => {form.elements.chapterId.innerHTML = chapterOptions(form.elements.subjectId.value);};
    form.elements.outOf.oninput = () => {const max = core.number(form.elements.outOf.value); if (max > 0) {form.elements.score.max = max; form.elements.classAverage.max = max;}};
    form.onsubmit = e => {
      e.preventDefault();
      const record = core.normalize(Object.fromEntries(new FormData(form)), g);
      if (record.error) {showToast(record.error); return;}
      if (g) state.grades = grades.map(x => x.id === id ? record : x);
      else state.grades = [...grades, {...record, id: uid('g'), createdAt: new Date().toISOString()}];
      closeModal(); save(); render(); showToast(g ? 'Note modifiée' : 'Note enregistrée');
    };
  }
  function remove(id) {
    if (!confirm('Supprimer cette note ?')) return;
    state.grades = core.list(state).filter(g => g.id !== id);
    save(); render(); showToast('Note supprimée');
  }
  function planRevision(chapterId) {
    const weak = core.weakChapters(state).find(w => w.chapter.id === chapterId);
    if (!weak) return;
    taskEditor();
    const form = document.querySelector('#modalForm');
    form.elements.title.value = `Reprendre : ${weak.chapter.name}`;
    if (form.elements.subject) form.elements.subject.value = weak.subject.name;
  }
  function reviseNow(chapterId) {
    const weak = core.weakChapters(state).find(w => w.chapter.id === chapterId);
    if (weak) prepareFocus({title: `Reprendre : ${weak.chapter.name}`, subject: weak.subject.name, minutes: 45});
  }
  function sparkline(points, color) {
    if (points.length < 2) return '<span class="grades-spark is-empty" aria-hidden="true"></span>';
    const w = 120, h = 32, x = i => (i / (points.length - 1) * (w - 4) + 2).toFixed(1), y = v => (h - 2 - Math.max(0, Math.min(20, v)) / 20 * (h - 4)).toFixed(1);
    return `<svg class="grades-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><line x1="0" x2="${w}" y1="${y(core.WEAK)}" y2="${y(core.WEAK)}" class="grades-spark-mid"/><polyline fill="none" stroke="${esc(color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${points.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/><circle cx="${x(points.length - 1)}" cy="${y(points[points.length - 1])}" r="3" fill="${esc(color)}"/></svg>`;
  }
  function gradeRow(g) {
    const subject = subjectOf(g.subjectId), chapter = chapterOf(subject, g.chapterId), low = core.on20(g) < core.WEAK;
    return `<article class="grades-row" data-grade-row="${esc(g.id)}"><span class="grades-date">${formatShort(g.date)}</span><span class="grades-kind">${core.kindLabel(g.kind)}</span>
      <div class="grades-what"><strong>${esc(subject?.name || 'Matière supprimée')}</strong><span>${esc(chapter?.name || 'Tout le programme')}</span>${g.note ? `<p>${esc(g.note)}</p>` : ''}</div>
      <div class="grades-score ${low ? 'is-low' : ''}"><strong>${fmt(g.score)}<small> / ${fmt(g.outOf)}</small></strong>${g.classAverage !== null && g.classAverage !== undefined ? `<span>Classe : ${fmt(g.classAverage)}</span>` : ''}</div>
      <div class="grades-row-actions"><button class="link-btn" data-grade-edit="${esc(g.id)}">Modifier</button><button class="link-btn" data-grade-delete="${esc(g.id)}">Supprimer</button></div></article>`;
  }
  function renderGrades() {
    const grades = core.list(state), sum = core.summary(state), subjects = core.bySubject(state), weak = core.weakChapters(state);
    if (filterSubject && !subjectOf(filterSubject)) filterSubject = '';
    const head = `<header class="section-head page-header"><div><h1>Colles et DS</h1><p>Tes notes, matière par matière.</p></div><button class="primary-btn" data-grade-new>+ Ajouter une note</button></header>`;
    if (!grades.length) {
      document.querySelector('#page').innerHTML = `<div class="grades-page">${head}<section class="card grades-empty"><h2>Garde une trace de tes colles et de tes DS</h2><p>Note chaque colle, DS ou concours blanc avec le chapitre concerné. Prepago calcule ta moyenne par matière, suit ta tendance et repère les chapitres à reprendre.</p><button class="primary-btn" data-grade-new>Ajouter ma première note</button></section></div>`;
      return;
    }
    const shown = core.sorted(grades).reverse().filter(g => (!filterSubject || g.subjectId === filterSubject) && (!filterKind || g.kind === filterKind));
    const stat = (label, value, detail = '') => `<div class="card grades-stat"><span>${label}</span><strong>${value}</strong>${detail ? `<small>${detail}</small>` : ''}</div>`;
    const trendText = sum.trend === null ? 'Il faut au moins 4 notes' : `${signed(sum.trend)} pt${Math.abs(sum.trend) >= 2 ? 's' : ''}`;
    document.querySelector('#page').innerHTML = `<div class="grades-page">${head}
      <section class="grades-summary">${stat('Moyenne générale', `${fmt(sum.average)}<small> / 20</small>`)}${stat('Notes enregistrées', sum.count)}${stat('Tendance', trendText, sum.trend === null ? '' : '3 dernières notes comparées aux 3 précédentes')}</section>
      <div class="grades-grid"><div class="grades-main">
        <section class="card grades-subjects"><h2>Par matière</h2>${subjects.map(r => `<button type="button" class="grades-subject ${filterSubject === r.subject.id ? 'is-active' : ''}" data-grade-filter="${esc(r.subject.id)}" aria-pressed="${filterSubject === r.subject.id}"><span class="grades-dot" style="background:${esc(r.subject.color || '#0A5CFF')}"></span><span class="grades-subject-name"><strong>${esc(r.subject.name)}</strong><small>${r.count} note${r.count > 1 ? 's' : ''}${r.gap === null ? '' : ` · ${signed(r.gap)} vs classe`}</small></span>${sparkline(r.points, r.subject.color || '#0A5CFF')}<span class="grades-subject-avg ${r.average < core.WEAK ? 'is-low' : ''}">${fmt(r.average)}<small> / 20</small></span></button>`).join('')}</section>
        <section class="card grades-history"><div class="grades-history-head"><h2>Historique</h2><div class="grades-filters"><label><span class="sr-only">Matière</span><select data-grade-subject-filter><option value="">Toutes les matières</option>${state.subjects.map(s => `<option value="${esc(s.id)}" ${s.id === filterSubject ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label><label><span class="sr-only">Épreuve</span><select data-grade-kind-filter><option value="">Toutes les épreuves</option>${core.kinds.map(([k, l]) => `<option value="${k}" ${k === filterKind ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div></div>
          <div class="grades-list">${shown.map(gradeRow).join('') || '<p class="grades-muted">Aucune note pour ces filtres.</p>'}</div></section>
      </div><aside class="grades-rail"><section class="card grades-weak"><h2>Chapitres à reprendre</h2>${weak.length ? weak.map(w => `<article class="grades-weak-row"><div><strong>${esc(w.chapter.name)}</strong><span>${esc(w.subject.name)} · dernière note ${fmt(core.round(core.on20(w.last)))} / 20${w.count > 1 ? ` · moyenne ${fmt(w.average)}` : ''}</span></div><div class="grades-weak-actions"><button class="secondary-btn" data-grade-plan="${esc(w.chapter.id)}">Planifier</button><button class="link-btn" data-grade-revise="${esc(w.chapter.id)}">Réviser maintenant</button></div></article>`).join('') : `<p class="grades-muted">Aucun chapitre dont la dernière note est sous ${core.WEAK}/20. Associe un chapitre à chaque note pour que Prepago repère ceux à retravailler.</p>`}</section></aside></div></div>`;
  }

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
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if ('gradeNew' in d) edit();
    if (d.gradeEdit) edit(d.gradeEdit);
    if (d.gradeDelete) remove(d.gradeDelete);
    if (d.gradePlan) planRevision(d.gradePlan);
    if (d.gradeRevise) reviseNow(d.gradeRevise);
    if (d.gradeFilter) {filterSubject = filterSubject === d.gradeFilter ? '' : d.gradeFilter; render();}
  });
  document.addEventListener('change', e => {
    if (e.target.matches('[data-grade-subject-filter]')) {filterSubject = e.target.value; render();}
    if (e.target.matches('[data-grade-kind-filter]')) {filterKind = e.target.value; render();}
  });
  window.addEventListener('prepago:state-replaced', () => {filterSubject = ''; filterKind = '';});
  window.PrepagoGrades = {render: renderGrades, edit};
})();
