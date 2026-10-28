/* Mode Épreuve: sit a past paper full screen against the clock, grade it with a barème,
   then follow scores in Mes épreuves. Grading goes through PrepagoEpreuveCore.gradeExam. */
(() => {
  const core = window.PrepagoEpreuveCore, plans = window.PrepagoPlans;
  const PAPER_FIELDS = 'id,filiere,subject,year,subject_path,subject_url,correction_path,correction_url,source_url,source_label,duration_minutes';
  const PHOTO_TYPES = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'};
  let client = null, userId = null, admin = false, generation = 0;
  let papers = new Map(), baremes = [], attempts = [], loaded = false, loading = false, loadError = '';
  let view = 'home', tab = 'new', filters = null, selected = null, minutes = null, run = null, grading = null, upgrade = null;
  let overlay = null, tick = null;

  const profile = () => window.PrepagoAccount?.profile || null;
  const friendly = e => (e && typeof e.message === 'string' && /[éèêàùçôî’]/.test(e.message) && e.message.length < 160) ? e.message : 'Action impossible. Vérifie ta connexion et réessaie.';
  const fmt = n => Number(n).toLocaleString('fr-FR', {maximumFractionDigits: 2});
  const label = p => p ? `${core.contestOf(p.filiere)} ${p.filiere} · ${p.subject} · ${p.year}` : 'Épreuve retirée';
  const hours = m => m % 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m / 60} h`;
  const usedLabel = s => `${Math.floor(s / 3600)} h ${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}`;
  const runKey = () => `prepago-epreuve-run-${userId}`;

  pageNames.epreuve = 'Épreuve';
  iconFiles.epreuve = 'file-clock';
  const nav = document.createElement('button');
  nav.className = 'nav-item'; nav.dataset.page = 'epreuve';
  nav.innerHTML = '<span class="icon"></span>Épreuve';
  (document.querySelector('[data-page="colle"]') || document.querySelector('[data-page="cnc"]')).after(nav);

  /* ---- Data -------------------------------------------------------------------------------- */
  async function load() {
    if (!client || loading) return;
    loading = true; loadError = '';
    const g = generation;
    const [p, b, a] = await Promise.all([
      client.from('cnc_exams').select(PAPER_FIELDS).eq('published', true).eq('archived', false).order('year', {ascending: false}).limit(5000),
      client.from('exam_baremes').select('id,paper_id,questions,status,author_user_id,created_at').limit(5000),
      client.from('exam_attempts').select('*').order('created_at', {ascending: false}).limit(500)
    ]);
    if (g !== generation) return;
    loading = false;
    if (p.error || b.error || a.error) loadError = friendly(p.error || b.error || a.error);
    papers = new Map((p.data || []).map(x => [x.id, x]));
    baremes = (b.data || []).filter(x => x.status === 'approved' || x.author_user_id === userId);
    attempts = a.data || [];
    loaded = true;
    if (!filters) {
      const filiere = profile()?.filiere;
      filters = {contest: '', filiere: [...papers.values()].some(x => x.filiere === filiere) ? filiere : '', subject: '', year: ''};
    }
    if (currentPage === 'epreuve' && view !== 'exam') render();
  }
  function baremeFor(paperId) {
    return baremes.find(b => b.paper_id === paperId && b.status === 'approved') || baremes.filter(b => b.paper_id === paperId && b.author_user_id === userId && b.status === 'pending').pop() || null;
  }
  function storedRun() { try {return JSON.parse(localStorage.getItem(runKey()) || 'null');} catch {return null;} }
  function storeRun() { try {if (run) localStorage.setItem(runKey(), JSON.stringify(run)); else localStorage.removeItem(runKey());} catch {} }

  /* ---- Exam (full screen) --------------------------------------------------------------------- */
  async function startExam() {
    const allowed = plans.check('examTimer', profile());
    if (!allowed.ok) {upgrade = allowed; view = 'upgrade'; return render();}
    run = {paperId: selected.id, durationSeconds: minutes * 60, startedAt: Date.now(), pausedAt: null, pausedTotal: 0, pauses: 0};
    storeRun();
    await openOverlay(true);
  }
  async function pdfUrl(path) {
    const r = await client.storage.from('cnc-documents').createSignedUrl(path, 4 * 3600);
    if (r.error) throw r.error;
    return r.data.signedUrl;
  }
  async function openOverlay(fullscreen) {
    const paper = papers.get(run.paperId);
    view = 'exam'; render();
    overlay?.remove();
    overlay = document.createElement('div');
    overlay.className = 'epreuve-focus'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', `Épreuve ${label(paper)}`);
    overlay.innerHTML = `<header class="epreuve-focus-bar"><div class="epreuve-focus-title"><span>Mode Épreuve</span><strong>${esc(label(paper))}</strong></div>
      <div class="epreuve-focus-clock" aria-live="off"><strong id="epreuveClock">${core.clock(core.leftSeconds(run))}</strong><small>restant · ${hours(run.durationSeconds / 60)}</small></div>
      <div class="epreuve-focus-actions"><button type="button" class="secondary-btn" data-epreuve-pause>${run.pausedAt ? 'Reprendre' : 'Pause'}</button><button type="button" class="primary-btn" data-epreuve-finish>J’ai fini</button></div></header>
      <div class="epreuve-focus-body"><div class="epreuve-paper" id="epreuvePaper"><p>Chargement du sujet…</p></div><div class="epreuve-paused" ${run.pausedAt ? '' : 'hidden'}><strong>Épreuve en pause</strong><p>Le sujet est masqué et le temps est arrêté.</p><button type="button" class="primary-btn" data-epreuve-pause>Reprendre</button></div></div>`;
    document.body.append(overlay);
    document.body.classList.add('epreuve-running');
    if (fullscreen) overlay.requestFullscreen?.().catch(() => {});
    clearInterval(tick); tick = setInterval(onTick, 500); onTick();
    try {
      const doc = await window.PrepagoCncDocuments.resolve(paper, pdfUrl);
      const box = overlay?.querySelector('#epreuvePaper');
      if (box) box.innerHTML = `<iframe class="epreuve-frame" src="${esc(doc.previewUrl)}" title="Sujet ${esc(label(paper))}"></iframe><a class="epreuve-open" href="${esc(doc.subjectUrl)}" target="_blank" rel="noopener noreferrer">Ouvrir le sujet dans un nouvel onglet</a>`;
    } catch {
      const box = overlay?.querySelector('#epreuvePaper');
      if (box) box.innerHTML = '<p>Le sujet ne s’affiche pas ici. Ouvre-le depuis la page CNC et CNAEM, le chronomètre continue.</p>';
    }
  }
  function onTick() {
    if (!run || !overlay) return;
    const left = core.leftSeconds(run), el = overlay.querySelector('#epreuveClock');
    if (el) {el.textContent = core.clock(left); el.classList.toggle('is-low', left <= 15 * 60);}
    if (left <= 0 && !run.pausedAt) finishExam(true);
  }
  function togglePause() {
    if (!run) return;
    run = run.pausedAt ? core.resume(run) : core.pause(run);
    storeRun();
    overlay.querySelector('.epreuve-paused').hidden = !run.pausedAt;
    overlay.querySelector('.epreuve-paper').hidden = !!run.pausedAt;
    overlay.querySelectorAll('[data-epreuve-pause]')[0].textContent = run.pausedAt ? 'Reprendre' : 'Pause';
  }
  function closeOverlay() {
    clearInterval(tick); tick = null;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    overlay?.remove(); overlay = null;
    document.body.classList.remove('epreuve-running');
  }
  function finishExam(timeUp = false) {
    if (!run) return;
    if (run.pausedAt) run = core.resume(run);
    const used = Math.min(run.durationSeconds, core.usedSeconds(run));
    closeOverlay();
    grading = {paperId: run.paperId, durationSeconds: run.durationSeconds, usedSeconds: used, pauses: run.pauses, points: [], rows: null};
    run = null; storeRun();
    view = 'grade'; render();
    if (timeUp) showToast('Temps écoulé : pose ton stylo et note ta copie.');
  }

  /* ---- Grading -------------------------------------------------------------------------------- */
  function readPoints() { grading.points = [...document.querySelectorAll('[data-epreuve-points]')].map(i => i.value); }
  function readRows() {
    grading.rows = [...document.querySelectorAll('[data-bareme-row]')].map(r => ({number: r.querySelector('[name=number]').value, label: r.querySelector('[name=label]').value, chapter: r.querySelector('[name=chapter]').value, max_points: r.querySelector('[name=max]').value}));
  }
  async function updateTotal() {
    const bareme = baremeFor(grading.paperId);
    if (!bareme) return;
    readPoints();
    const result = await core.gradeExam({questions: bareme.questions, points: grading.points});
    const el = document.querySelector('#epreuveTotal');
    if (el) el.innerHTML = `${fmt(result.total_20 ?? 0)}<small> / 20</small>`;
    const raw = document.querySelector('#epreuveRaw');
    if (raw) raw.textContent = `${fmt(result.earned)} / ${fmt(result.total)} points`;
  }
  async function saveBareme(button) {
    readRows();
    const result = core.normalizeBareme(grading.rows);
    if (result.error) return showToast(result.error);
    button.disabled = true;
    const {data, error} = await client.from('exam_baremes').insert({paper_id: grading.paperId, questions: result.questions}).select('id,paper_id,questions,status,author_user_id,created_at').single();
    button.disabled = false;
    if (error) return showToast(friendly(error));
    baremes.push(data); grading.rows = null;
    showToast('Barème enregistré. Il servira aux autres après validation.');
    render();
  }
  async function saveAttempt(button, withScores) {
    const bareme = withScores ? baremeFor(grading.paperId) : null;
    if (withScores) readPoints();
    const files = [...(document.querySelector('#epreuvePhotos')?.files || [])];
    if (files.length > 12) return showToast('Douze photos au maximum.');
    if (files.some(f => !PHOTO_TYPES[f.type] || f.size > 8 * 1024 * 1024)) return showToast('Photos JPG, PNG ou WebP de 8 Mo maximum.');
    button.disabled = true;
    const graded = bareme ? await core.gradeExam({questions: bareme.questions, points: grading.points}) : {scores: [], total_20: null};
    const {data, error} = await client.from('exam_attempts').insert({paper_id: grading.paperId, bareme_id: bareme?.id || null, duration_seconds: grading.durationSeconds, used_seconds: grading.usedSeconds, pauses: grading.pauses, scores: graded.scores, total_20: graded.total_20}).select('*').single();
    if (error) {button.disabled = false; return showToast(friendly(error));}
    let saved = data;
    if (files.length) {
      const paths = [];
      for (const file of files) {
        const path = `${userId}/${data.id}/${crypto.randomUUID()}.${PHOTO_TYPES[file.type]}`;
        const up = await client.storage.from('exam-copies').upload(path, file, {contentType: file.type, upsert: false});
        if (!up.error) paths.push(path);
      }
      if (paths.length) {
        const upd = await client.from('exam_attempts').update({copy_photos: paths}).eq('id', data.id).select('*').single();
        if (!upd.error) saved = upd.data;
      }
      if (paths.length < files.length) showToast('Certaines photos n’ont pas pu être envoyées.');
    }
    attempts.unshift(saved); grading = null; view = 'home'; tab = 'history';
    render(); showToast(saved.total_20 === null ? 'Épreuve enregistrée' : `Épreuve enregistrée : ${fmt(saved.total_20)} / 20`);
  }

  /* ---- Views ----------------------------------------------------------------------------------- */
  function filtered() {
    return [...papers.values()].filter(p => (!filters.contest || core.contestOf(p.filiere) === filters.contest) && (!filters.filiere || p.filiere === filters.filiere)
      && (!filters.subject || p.subject === filters.subject) && (!filters.year || String(p.year) === filters.year));
  }
  function newView() {
    const all = [...papers.values()], select = (key, label, values) => `<label class="field"><span>${label}</span><select data-epreuve-filter="${key}"><option value="">Tous</option>${values.map(v => `<option value="${esc(v)}" ${String(filters[key]) === String(v) ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
    const scope = all.filter(p => (!filters.contest || core.contestOf(p.filiere) === filters.contest) && (!filters.filiere || p.filiere === filters.filiere));
    const list = filtered().slice(0, 120), last = id => attempts.find(a => a.paper_id === id && a.total_20 !== null);
    const resume = storedRun();
    return `${resume && papers.has(resume.paperId) ? `<section class="card epreuve-resume"><div><strong>Une épreuve est en cours</strong><span>${esc(label(papers.get(resume.paperId)))} · ${core.clock(core.leftSeconds(resume))} restant</span></div><button class="primary-btn" data-epreuve-resume>Reprendre</button></section>` : ''}
      <section class="card epreuve-filters">${select('contest', 'Concours', ['CNC', 'CNAEM'])}${select('filiere', 'Filière', [...new Set(all.map(p => p.filiere))].sort())}${select('subject', 'Matière', [...new Set(scope.map(p => p.subject))].sort((a, b) => a.localeCompare(b, 'fr')))}${select('year', 'Année', [...new Set(scope.map(p => String(p.year)))].sort().reverse())}</section>
      <section class="card epreuve-papers"><div class="epreuve-list-head"><h2>Choisis ton sujet</h2><span>${filtered().length} sujet${filtered().length > 1 ? 's' : ''}</span></div>
        ${list.map(p => {const a = last(p.id), b = baremeFor(p.id); return `<button type="button" class="epreuve-paper-row" data-epreuve-paper="${esc(p.id)}"><span class="epreuve-year">${p.year}</span><span class="epreuve-paper-name"><strong>${esc(p.subject)}</strong><small>${core.contestOf(p.filiere)} ${esc(p.filiere)} · ${hours(core.defaultMinutes(p))}${b ? ' · barème disponible' : ''}</small></span>${a ? `<em>${fmt(a.total_20)} / 20</em>` : '<em class="is-new">À faire</em>'}</button>`;}).join('') || '<p class="epreuve-muted">Aucun sujet pour ces filtres.</p>'}</section>`;
  }
  function setupView() {
    const p = selected, official = p.duration_minutes, options = [...new Set([...core.DURATIONS, official].filter(Boolean))].sort((a, b) => a - b), b = baremeFor(p.id);
    return `<div class="epreuve-page"><header class="section-head page-header"><div><h1>Épreuve</h1></div><button class="secondary-btn" data-epreuve-back>Retour aux sujets</button></header>
      <section class="card epreuve-setup"><span class="epreuve-kicker">${core.contestOf(p.filiere)} ${esc(p.filiere)} · ${p.year}</span><h2>${esc(p.subject)}</h2>
        <p class="epreuve-muted">${official ? `Durée officielle : ${hours(official)}.` : 'Durée officielle non renseignée : 4 h proposées par défaut.'} ${b ? 'Un barème est prêt pour noter ta copie.' : 'Pas encore de barème : tu pourras en créer un à la fin.'}</p>
        <div class="epreuve-durations" role="group" aria-label="Durée">${options.map(m => `<button type="button" data-epreuve-minutes="${m}" aria-pressed="${m === minutes}">${hours(m)}${m === official ? '<small>officielle</small>' : ''}</button>`).join('')}</div>
        ${admin ? `<label class="field epreuve-admin"><span>Durée officielle (administrateur)</span><select data-epreuve-official><option value="">Non renseignée</option>${[90, 120, 180, 240, 300].map(m => `<option value="${m}" ${official === m ? 'selected' : ''}>${hours(m)}</option>`).join('')}</select></label>` : ''}
        <ul class="epreuve-rules"><li>Le sujet s’ouvre en plein écran avec un grand chronomètre.</li><li>Tu peux mettre en pause : le sujet est masqué et les pauses sont comptées.</li><li>À la fin, note ta copie question par question avec le barème.</li></ul>
        <button class="primary-btn epreuve-start" data-epreuve-start>Commencer l’épreuve · ${hours(minutes)}</button></section></div>`;
  }
  function gradeView() {
    const g = grading, p = papers.get(g.paperId), b = baremeFor(g.paperId);
    const head = `<header class="section-head page-header"><div><h1>Note ta copie</h1></div></header><section class="card epreuve-done"><strong>${esc(label(p))}</strong><span>Temps utilisé ${usedLabel(g.usedSeconds)} sur ${hours(g.durationSeconds / 60)} · ${g.pauses} pause${g.pauses > 1 ? 's' : ''}</span></section>`;
    const photos = `<label class="field epreuve-photos"><span>Photos de ta copie (facultatif)</span><input id="epreuvePhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple><small>Gardées avec ton épreuve pour la correction automatique à venir.</small></label>`;
    if (!b) {
      const rows = g.rows;
      return `<div class="epreuve-page">${head}<section class="card epreuve-bareme"><h2>Pas encore de barème pour ce sujet</h2><p class="epreuve-muted">Crée une grille simple : elle te sert tout de suite, et après validation elle servira aux autres élèves.</p>
        ${rows ? `<div class="epreuve-bareme-rows"><div class="epreuve-bareme-head"><span>N°</span><span>Intitulé (facultatif)</span><span>Chapitre (facultatif)</span><span>Points</span><span></span></div>${rows.map((r, i) => `<div class="epreuve-bareme-row" data-bareme-row><input name="number" aria-label="Numéro de la question ${i + 1}" maxlength="12" value="${esc(r.number)}"><input name="label" aria-label="Intitulé de la question ${i + 1}" maxlength="200" value="${esc(r.label || '')}"><input name="chapter" aria-label="Chapitre de la question ${i + 1}" maxlength="160" value="${esc(r.chapter || '')}"><input name="max" aria-label="Points de la question ${i + 1}" type="number" min="0.25" max="100" step="0.25" value="${esc(r.max_points)}"><button type="button" class="link-btn" data-epreuve-row-remove="${i}" ${rows.length < 2 ? 'disabled' : ''}>Retirer</button></div>`).join('')}</div>
          <div class="epreuve-actions"><button type="button" class="link-btn" data-epreuve-row-add>+ Question</button><button type="button" class="primary-btn" data-epreuve-bareme-save>Enregistrer le barème</button></div>`
        : `<form class="epreuve-bareme-quick" data-epreuve-bareme-make><label class="field"><span>Nombre de questions</span><input name="count" type="number" min="1" max="60" value="10" required></label><label class="field"><span>Points par question</span><input name="points" type="number" min="0.25" max="100" step="0.25" value="2" required></label><button class="primary-btn" type="submit">Créer la grille</button></form>`}</section>
        <section class="card epreuve-skip">${photos}<div class="epreuve-actions"><button type="button" class="secondary-btn" data-epreuve-save-plain>Enregistrer sans note</button></div></section></div>`;
    }
    return `<div class="epreuve-page">${head}<section class="card epreuve-grid"><div class="epreuve-grid-head"><div><h2>Barème${b.status === 'pending' ? ' (en attente de validation)' : ''}</h2><p class="epreuve-muted">Pour chaque question, saisis les points que tu as obtenus.</p></div><div class="epreuve-total"><strong id="epreuveTotal">0<small> / 20</small></strong><span id="epreuveRaw"></span></div></div>
      <div class="epreuve-score-rows">${b.questions.map((q, i) => `<label class="epreuve-score-row"><span class="epreuve-qnum">Q${esc(q.number)}</span><span class="epreuve-qlabel">${esc(q.label || 'Question ' + q.number)}${q.chapter ? `<small>${esc(q.chapter)}</small>` : ''}</span><input type="number" inputmode="decimal" min="0" max="${q.max_points}" step="0.25" data-epreuve-points value="${esc(g.points[i] ?? '')}" aria-label="Points obtenus à la question ${esc(q.number)}"><em>/ ${fmt(q.max_points)}</em></label>`).join('')}</div>
      ${photos}<div class="epreuve-actions"><button type="button" class="secondary-btn" data-epreuve-save-plain>Enregistrer sans note</button><button type="button" class="primary-btn" data-epreuve-save>Enregistrer ma note</button></div></section></div>`;
  }
  function chart(series) {
    const labelled = series.length <= 4 ? series.filter(s => s.points.length > 1) : [];
    const W = 640, H = 240, L = 34, R = labelled.length ? 104 : 16, T = 12, B = 28;
    const times = series.flatMap(s => s.points.map(p => Date.parse(p.date)));
    const t0 = Math.min(...times), t1 = Math.max(...times), span = t1 - t0 || 1;
    const x = t => times.length > 1 && t1 > t0 ? L + (t - t0) / span * (W - L - R) : L + (W - L - R) / 2, y = v => T + (20 - v) / 20 * (H - T - B);
    const grid = [0, 5, 10, 15, 20].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="epreuve-grid-line ${v === 10 ? 'is-mid' : ''}"/><text x="${L - 8}" y="${y(v) + 4}" class="epreuve-axis" text-anchor="end">${v}</text>`).join('');
    // Direct labels sit beside each line's last point, nudged apart when two ends are close.
    const ends = labelled.map(s => {const p = s.points[s.points.length - 1]; return {s, x: x(Date.parse(p.date)), y: y(p.value)};}).sort((a, b) => a.y - b.y);
    ends.forEach((e, i) => {if (i && Math.abs(e.x - ends[i - 1].x) < 90 && e.y - ends[i - 1].y < 14) e.y = ends[i - 1].y + 14;});
    const dateLabel = t => new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'short'}).format(new Date(t));
    return `<svg class="epreuve-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Notes sur 20 par matière au fil du temps">${grid}
      <text x="${L}" y="${H - 6}" class="epreuve-axis">${dateLabel(t0)}</text>${t1 > t0 ? `<text x="${W - R}" y="${H - 6}" class="epreuve-axis" text-anchor="end">${dateLabel(t1)}</text>` : ''}
      ${series.map(s => `<g style="--line: var(--series-${s.slot})">${s.points.length > 1 ? `<polyline class="epreuve-line" points="${s.points.map(p => `${x(Date.parse(p.date)).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}"/>` : ''}
        ${s.points.map(p => `<circle class="epreuve-dot" cx="${x(Date.parse(p.date)).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4"/><circle class="epreuve-hit" cx="${x(Date.parse(p.date)).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="12" tabindex="0" data-tip="${esc(`${s.family} · ${label(p.paper)} · ${fmt(p.value)} / 20 · ${dateLabel(Date.parse(p.date))}`)}"/>`).join('')}</g>`).join('')}
      ${ends.map(e => `<text x="${(e.x + 10).toFixed(1)}" y="${(e.y + 4).toFixed(1)}" class="epreuve-end-label">${esc(e.s.family)}</text>`).join('')}</svg>`;
  }
  function historyView() {
    const done = attempts;
    const allowed = plans.check('examHistory', profile());
    let stats = '';
    if (!allowed.ok) stats = window.PrepagoUpgrade.html(allowed);
    else if (done.some(a => a.total_20 !== null)) {
      const series = core.series(done, papers), weak = core.weakest(done, papers);
      stats = `<div class="epreuve-stats"><section class="card epreuve-chart"><h2>Mes notes par matière</h2><div class="epreuve-legend">${series.map(s => `<span><i style="background: var(--series-${s.slot})"></i>${esc(s.family)}</span>`).join('')}</div>
          <div class="epreuve-chart-box">${chart(series)}<div class="epreuve-tip" role="tooltip" hidden></div></div>
          <details class="epreuve-table"><summary>Voir les données</summary><table><thead><tr><th>Date</th><th>Matière</th><th>Sujet</th><th>Note</th></tr></thead><tbody>${series.flatMap(s => s.points.map(p => `<tr><td>${formatShort(String(p.date).slice(0, 10))}</td><td>${esc(s.family)}</td><td>${esc(label(p.paper))}</td><td>${fmt(p.value)} / 20</td></tr>`)).join('')}</tbody></table></details></section>
        <section class="card epreuve-weak"><h2>À retravailler</h2>${weak.chapters.length ? `<h3>Chapitres</h3>${weak.chapters.map(c => `<div class="epreuve-weak-row"><span>${esc(c.chapter)}<small>${c.count} question${c.count > 1 ? 's' : ''}</small></span><strong>${Math.round(c.ratio * 100)} %</strong></div>`).join('')}` : ''}
          ${weak.questions.length ? `<h3>Questions</h3>${weak.questions.map(q => `<div class="epreuve-weak-row"><span>${esc(q.label)}<small>${esc(label(q.paper))}</small></span><strong>${fmt(q.points)} / ${fmt(q.max)}</strong></div>`).join('')}` : ''}
          ${!weak.chapters.length && !weak.questions.length ? '<p class="epreuve-muted">Rien à signaler : aucune question sous la moitié des points. Ajoute les chapitres dans tes barèmes pour un suivi plus fin.</p>' : ''}</section></div>`;
    }
    return `${stats}<section class="card epreuve-history"><h2>Historique</h2>${done.map(a => `<div class="epreuve-history-row"><span class="epreuve-date">${formatShort(String(a.created_at).slice(0, 10))}</span><span class="epreuve-paper-name"><strong>${esc(label(papers.get(a.paper_id)))}</strong><small>${usedLabel(a.used_seconds)} sur ${hours(a.duration_seconds / 60)} · ${a.pauses} pause${a.pauses > 1 ? 's' : ''}${a.copy_photos?.length ? ` · ${a.copy_photos.length} photo${a.copy_photos.length > 1 ? 's' : ''}` : ''}</small></span><strong class="${a.total_20 !== null && a.total_20 < 10 ? 'is-low' : ''}">${a.total_20 === null ? 'Sans note' : `${fmt(a.total_20)} / 20`}</strong></div>`).join('') || '<p class="epreuve-muted">Tes épreuves apparaîtront ici.</p>'}</section>`;
  }
  function homeView() {
    if (!loaded) return `<div class="epreuve-page"><header class="section-head page-header"><div><h1>Épreuve</h1></div></header><section class="card"><p class="epreuve-muted">${loadError ? esc(loadError) : 'Chargement des sujets…'}</p></section></div>`;
    return `<div class="epreuve-page"><header class="section-head page-header"><div><h1>Épreuve</h1><p>Les annales en conditions réelles.</p></div><div class="epreuve-tabs" role="tablist"><button type="button" role="tab" aria-selected="${tab === 'new'}" data-epreuve-tab="new">Nouvelle épreuve</button><button type="button" role="tab" aria-selected="${tab === 'history'}" data-epreuve-tab="history">Mes épreuves</button></div></header>
      ${loadError ? `<p class="epreuve-muted">${esc(loadError)}</p>` : ''}${tab === 'history' ? historyView() : newView()}</div>`;
  }
  function renderEpreuve() {
    if (!loaded && !loading) void load();
    const page = document.querySelector('#page');
    if (view === 'exam') page.innerHTML = `<div class="epreuve-page"><header class="section-head page-header"><div><h1>Épreuve</h1></div></header><section class="card"><p class="epreuve-muted">Épreuve en cours en plein écran.</p><button class="primary-btn" data-epreuve-resume>Revenir au sujet</button></section></div>`;
    else if (view === 'upgrade' && upgrade) page.innerHTML = `<div class="epreuve-page"><header class="section-head page-header"><div><h1>Épreuve</h1></div></header>${window.PrepagoUpgrade.html(upgrade, 'data-epreuve-back')}</div>`;
    else if (view === 'setup' && selected) page.innerHTML = setupView();
    else if (view === 'grade' && grading) page.innerHTML = gradeView();
    else page.innerHTML = homeView();
    if (view === 'grade') void updateTotal();
  }
  const baseRender = render;
  render = function () {
    if (currentPage !== 'epreuve') return baseRender();
    window.PrepagoFocus?.leaveImmersive();
    renderEpreuve();
    document.body.dataset.page = 'epreuve';
    document.body.classList.remove('focus-cockpit-immersive');
    document.querySelectorAll('.nav-item').forEach(n => {n.classList.toggle('active', n.dataset.page === 'epreuve'); if (n.dataset.page === 'epreuve') n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');});
    refreshIcons(); updateSidebar();
  };

  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return; const d = b.dataset;
    if ('epreuvePause' in d) return togglePause();
    if ('epreuveFinish' in d) {if (confirm('Terminer l’épreuve et passer à la notation ?')) finishExam(); return;}
    if (currentPage !== 'epreuve') return;
    if (d.epreuveTab) {tab = d.epreuveTab; view = 'home'; render();}
    if (d.epreuvePaper) {selected = papers.get(d.epreuvePaper); minutes = core.defaultMinutes(selected); view = 'setup'; render();}
    if (d.epreuveMinutes) {minutes = Number(d.epreuveMinutes); render();}
    if ('epreuveBack' in d) {view = 'home'; upgrade = null; render();}
    if ('epreuveStart' in d) void startExam();
    if ('epreuveResume' in d) {run = run || storedRun(); if (run && papers.has(run.paperId)) void openOverlay(true); else {run = null; storeRun(); render();}}
    if ('epreuveRowAdd' in d) {readRows(); grading.rows.push({number: String(grading.rows.length + 1), label: '', chapter: '', max_points: grading.rows.at(-1)?.max_points || 2}); render();}
    if (d.epreuveRowRemove) {readRows(); grading.rows.splice(Number(d.epreuveRowRemove), 1); render();}
    if ('epreuveBaremeSave' in d) void saveBareme(b);
    if ('epreuveSave' in d) void saveAttempt(b, true);
    if ('epreuveSavePlain' in d) {if (confirm('Enregistrer l’épreuve sans note ?')) void saveAttempt(b, false);}
  });
  document.addEventListener('change', async e => {
    if (currentPage !== 'epreuve') return;
    const t = e.target;
    if (t.dataset.epreuveFilter) {filters[t.dataset.epreuveFilter] = t.value; if (['contest', 'filiere'].includes(t.dataset.epreuveFilter)) {filters.subject = ''; filters.year = '';} render();}
    if (t.matches('[data-epreuve-official]') && admin) {
      const value = t.value ? Number(t.value) : null;
      const {error} = await client.from('cnc_exams').update({duration_minutes: value}).eq('id', selected.id);
      if (error) return showToast(friendly(error));
      selected.duration_minutes = value; minutes = core.defaultMinutes(selected); render(); showToast('Durée officielle enregistrée');
    }
  });
  document.addEventListener('input', e => {if (currentPage === 'epreuve' && e.target.matches('[data-epreuve-points]')) void updateTotal();});
  document.addEventListener('submit', e => {
    if (currentPage !== 'epreuve' || !e.target.matches('[data-epreuve-bareme-make]')) return;
    e.preventDefault(); grading.rows = core.evenBareme(e.target.elements.count.value, e.target.elements.points.value); render();
  });
  const tip = (target, show) => {
    const box = target.closest('.epreuve-chart-box'), el = box?.querySelector('.epreuve-tip');
    if (!el) return;
    if (!show) {el.hidden = true; return;}
    const r = target.getBoundingClientRect(), base = box.getBoundingClientRect();
    el.textContent = target.dataset.tip; el.hidden = false;
    el.style.left = `${Math.min(base.width - el.offsetWidth, Math.max(0, r.left - base.left + r.width / 2 - el.offsetWidth / 2))}px`;
    el.style.top = `${Math.max(0, r.top - base.top - el.offsetHeight - 6)}px`;
  };
  document.addEventListener('pointerover', e => {if (e.target.matches?.('.epreuve-hit')) tip(e.target, true);});
  document.addEventListener('pointerout', e => {if (e.target.matches?.('.epreuve-hit')) tip(e.target, false);});
  document.addEventListener('focusin', e => {if (e.target.matches?.('.epreuve-hit')) tip(e.target, true);});
  document.addEventListener('focusout', e => {if (e.target.matches?.('.epreuve-hit')) tip(e.target, false);});
  window.addEventListener('beforeunload', e => {if (run) {e.preventDefault(); e.returnValue = '';}});

  function connect(c, id, isAdmin) {
    generation++; closeOverlay(); client = c; userId = id; admin = !!isAdmin;
    papers = new Map(); baremes = []; attempts = []; loaded = false; loading = false; filters = null;
    view = 'home'; tab = 'new'; selected = null; run = null; grading = null; upgrade = null;
    if (currentPage === 'epreuve') render();
  }
  function clear() {
    generation++; closeOverlay(); client = null; userId = null; admin = false;
    papers = new Map(); baremes = []; attempts = []; loaded = false; loading = false; filters = null;
    view = 'home'; selected = null; run = null; grading = null; upgrade = null;
  }
  window.PrepagoEpreuve = {connect, clear};
})();
