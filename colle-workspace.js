/* Simulateur de colle: solo or duo (two phones, 4-digit code), question bank fed by students,
   admin moderation of questions and barèmes. Grading goes through PrepagoColleCore.gradeColle. */
(() => {
  const core = window.PrepagoColleCore, plans = window.PrepagoPlans;
  const KATEX = '/vendor/katex-0.16.47/', POLL_MS = 2000;
  const QUESTION_FIELDS = 'id,filiere,subject,chapter,chapter_key,type,statement,difficulty,checklist,traps,status,author_user_id,created_at';
  let client = null, userId = null, admin = false, generation = 0;
  const pools = new Map();
  let attempts = [], contribution = null, submissions = [], pendingReview = 0;
  let view = 'home', setup = null, query = '', run = null, upgrade = null, form = null, tick = null, pollTimer = null, pushTimer = null;
  let moderation = {tab: 'questions', questions: [], baremes: [], papers: new Map(), loading: false};

  const profile = () => window.PrepagoAccount?.profile || null;
  const catalog = () => window.PrepagoCurriculumCatalog;
  // Messages raised by our database functions are French; anything else gets a generic message.
  const friendly = e => (e && typeof e.message === 'string' && /[éèêàùçôî’]/.test(e.message) && e.message.length < 160) ? e.message : 'Action impossible. Vérifie ta connexion et réessaie.';
  const fmt = n => Number(n).toLocaleString('fr-FR', {maximumFractionDigits: 1});
  const dots = d => `<span class="colle-difficulty" aria-label="Difficulté ${d} sur 3">${[1, 2, 3].map(i => `<i class="${i <= d ? 'is-on' : ''}"></i>`).join('')}</span>`;

  pageNames.colle = 'Colle';
  iconFiles.colle = 'mic-vocal';
  const nav = document.createElement('button');
  nav.className = 'nav-item'; nav.dataset.page = 'colle';
  nav.innerHTML = '<span class="icon"></span>Colle';
  document.querySelector('[data-page="cnc"]').after(nav);

  /* ---- Math (KaTeX, loaded on first use) --------------------------------------------------- */
  let mathReady = null;
  function loadMath() {
    if (window.renderMathInElement) return Promise.resolve();
    if (mathReady) return mathReady;
    const add = (tag, attrs) => new Promise((resolve, reject) => {const el = document.createElement(tag); Object.assign(el, attrs); el.onload = resolve; el.onerror = reject; document.head.append(el);});
    mathReady = Promise.all([add('link', {rel: 'stylesheet', href: KATEX + 'katex.min.css'}), add('script', {src: KATEX + 'katex.min.js'}).then(() => add('script', {src: KATEX + 'auto-render.min.js'}))])
      .catch(() => {mathReady = null;});
    return mathReady;
  }
  function typeset(root = document.querySelector('#page')) {
    if (!root?.querySelector('[data-math]')) return;
    loadMath().then(() => root.querySelectorAll('[data-math]:not([data-math-done])').forEach(el => {
      el.dataset.mathDone = '';
      window.renderMathInElement?.(el, {throwOnError: false, delimiters: [{left: '$$', right: '$$', display: true}, {left: '\\[', right: '\\]', display: true}, {left: '$', right: '$', display: false}, {left: '\\(', right: '\\)', display: false}]});
    }));
  }

  /* ---- Data -------------------------------------------------------------------------------- */
  function loadSetup() {
    const base = {filiere: core.defaultClass(profile()?.filiere), subject: 'math', chapterId: null, prep: 5, pass: 15, mode: 'solo'};
    try {return {...base, ...JSON.parse(localStorage.getItem(`prepago-colle-setup-${userId}`) || '{}')};} catch {return base;}
  }
  function saveSetup() { try {localStorage.setItem(`prepago-colle-setup-${userId}`, JSON.stringify(setup));} catch {} }
  function poolFor(filiere = setup.filiere, subject = setup.subject) {
    const key = `${filiere}|${subject}`;
    if (!pools.has(key)) {
      const entry = {rows: null, error: ''}; pools.set(key, entry);
      const g = generation;
      client?.from('colle_questions').select(QUESTION_FIELDS).eq('status', 'approved').eq('filiere', filiere).eq('subject', subject).limit(2000)
        .then(({data, error}) => {if (g !== generation) return; if (error) {entry.error = friendly(error); pools.delete(key);} else entry.rows = data || []; if (currentPage === 'colle' && ['home', 'submit'].includes(view)) render();});
    }
    return pools.get(key);
  }
  async function refreshMine() {
    if (!client) return;
    const g = generation;
    const [a, c, s] = await Promise.all([
      client.from('colle_attempts').select('id,question_id,mode,score,prep_seconds,pass_seconds,created_at,colle_questions(chapter,subject,type)').order('created_at', {ascending: false}).limit(300),
      client.rpc('colle_contribution'),
      client.from('colle_questions').select('id,chapter,type,status,created_at').eq('author_user_id', userId).order('created_at', {ascending: false}).limit(50)
    ]);
    if (g !== generation) return;
    if (!a.error) attempts = a.data || [];
    if (!c.error) contribution = c.data;
    if (!s.error) submissions = s.data || [];
    if (admin) {
      const p = await client.from('colle_questions').select('id').eq('status', 'pending').limit(500);
      const b = await client.from('exam_baremes').select('id').eq('status', 'pending').limit(500);
      if (g === generation) pendingReview = (p.data?.length || 0) + (b.data?.length || 0);
    }
    if (currentPage === 'colle' && view === 'home') render();
  }

  /* ---- Starting a colle ---------------------------------------------------------------------- */
  function options() {
    const pool = poolFor();
    return pool.rows ? core.chapterOptions(catalog(), setup.filiere, setup.subject, pool.rows) : [];
  }
  async function start(random = false) {
    const pool = poolFor();
    if (!pool.rows) return showToast('Chargement des questions…');
    const opts = options();
    const chapter = random ? core.pickChapter(opts, pool.rows, attempts) : opts.find(o => o.id === setup.chapterId);
    if (!chapter) return showToast(random ? 'Aucune question disponible pour cette matière.' : 'Choisis un chapitre.');
    const allowed = plans.check(setup.mode === 'duo' ? 'colleDuo' : 'colleSolo', profile(), {collesThisWeek: core.collesThisWeek(attempts)});
    if (!allowed.ok) {upgrade = allowed; view = 'upgrade'; return render();}
    const question = core.pickQuestion(pool.rows.filter(q => core.inChapter(q, chapter)), attempts);
    if (!question) return showToast('Aucune question pour ce chapitre.');
    setup.chapterId = chapter.id; saveSetup();
    const prep = Number(setup.prep) * 60, pass = Number(setup.pass) * 60;
    run = {mode: setup.mode === 'duo' ? 'host' : 'solo', question, chapter: chapter.name, prep, pass, phase: prep ? 'prep' : 'pass', phaseStart: Date.now(), prepUsed: 0, passUsed: 0, checked: new Set(), traps: new Set(), score: 0, session: null, offset: 0};
    if (run.mode === 'host') {
      try {
        const {data, error} = await client.rpc('colle_session_create', {question: question.id, prep, pass});
        if (error) throw error;
        applySession(data); startPolling();
      } catch (e) {run = null; return showToast(friendly(e));}
    }
    view = 'run'; render();
  }
  async function join(code) {
    if (!/^[0-9]{4}$/.test(code)) return showToast('Le code contient 4 chiffres.');
    try {
      const {data, error} = await client.rpc('colle_session_join', {join_code: code});
      if (error) throw error;
      const q = await client.from('colle_questions').select('id,chapter,type,statement,difficulty').eq('id', data.question_id).single();
      if (q.error) throw q.error;
      run = {mode: 'guest', question: q.data, chapter: q.data.chapter, prep: data.prep_seconds, pass: data.pass_seconds, phase: 'ready', phaseStart: Date.now(), checked: new Set(), traps: new Set(), score: null, session: null, offset: 0};
      applySession(data); startPolling(); view = 'run'; render();
    } catch (e) {showToast(friendly(e));}
  }

  /* ---- Timers ------------------------------------------------------------------------------ */
  const now = () => Date.now();
  const duration = phase => phase === 'prep' ? run.prep : run.pass;
  const elapsed = () => (now() - run.phaseStart) / 1000;
  function remaining() { return ['prep', 'pass'].includes(run.phase) ? duration(run.phase) - elapsed() : 0; }
  function setPhase(phase) {
    if (run.phase === 'prep') run.prepUsed = Math.min(run.prep, Math.round(elapsed()));
    if (run.phase === 'pass') run.passUsed = Math.min(run.pass, Math.round(elapsed()));
    run.phase = phase; run.phaseStart = now();
  }
  function onTick() {
    if (!run || currentPage !== 'colle' || view !== 'run') return;
    const clockEl = document.querySelector('#colleClock'), bar = document.querySelector('#colleBar');
    if (['prep', 'pass'].includes(run.phase)) {
      const left = remaining();
      if (clockEl) clockEl.textContent = core.clock(left);
      if (bar) bar.style.width = `${Math.min(100, Math.max(0, 100 - left / duration(run.phase) * 100))}%`;
      if (left <= 0 && run.mode === 'solo') {
        if (run.phase === 'prep') {setPhase('pass'); render(); showToast('Préparation terminée : à toi de passer au tableau.');}
        else {setPhase('over'); render(); showToast('Temps écoulé.');}
      }
      if (left <= 0 && run.mode === 'host' && run.phase === 'prep' && !run.driving) void drive('pass');
    }
  }
  function startTick() { if (!tick) tick = setInterval(onTick, 250); }

  /* ---- Duo ----------------------------------------------------------------------------------- */
  function applySession(s) {
    if (!run || !s) return;
    const changed = !run.session || run.session.phase !== s.phase || run.session.guest_id !== s.guest_id || run.session.phase_started_at !== s.phase_started_at;
    run.session = s;
    run.offset = Date.parse(s.server_now) - Date.now();
    run.prep = s.prep_seconds; run.pass = s.pass_seconds;
    run.phase = s.phase === 'done' ? 'done' : s.phase;
    run.phaseStart = s.phase_started_at ? Date.parse(s.phase_started_at) - run.offset : Date.now();
    if (s.score !== null && s.score !== undefined) run.score = Number(s.score);
    if (run.mode === 'host' && !pushTimer) run.checked = new Set(s.checked_items || []);
    if (['done', 'cancelled'].includes(s.phase)) stopPolling();
    return changed;
  }
  function startPolling() {
    stopPolling();
    const id = run.session.id, g = generation;
    pollTimer = setInterval(async () => {
      if (!run?.session || run.session.id !== id || g !== generation) return stopPolling();
      const {data, error} = await client.rpc('colle_session_state', {session: id});
      if (error || g !== generation || !run?.session || run.session.id !== id) return;
      if (applySession(data) && currentPage === 'colle' && view === 'run') render();
    }, POLL_MS);
  }
  function stopPolling() { clearInterval(pollTimer); pollTimer = null; }
  async function drive(phase) {
    if (run?.mode !== 'host' || run.driving) return;
    run.driving = true;
    const before = run.phase;
    if (before === 'prep') run.prepUsed = Math.min(run.prep, Math.round(elapsed()));
    if (before === 'pass') run.passUsed = Math.min(run.pass, Math.round(elapsed()));
    const {data, error} = await client.from('colle_sessions').update({phase}).eq('id', run.session.id).select('*').single();
    run.driving = false;
    if (error) return showToast(friendly(error));
    applySession({...data, server_now: new Date(Date.now() + run.offset).toISOString()});
    render();
  }
  function pushChecks() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      pushTimer = null;
      if (run?.mode !== 'host') return;
      const {error} = await client.from('colle_sessions').update({checked_items: [...run.checked].sort()}).eq('id', run.session.id);
      if (error) showToast(friendly(error));
    }, 400);
  }

  /* ---- Grading and saving -------------------------------------------------------------------- */
  async function updateScore() {
    const graded = await core.gradeColle({question: run.question, checked_items: [...run.checked]});
    run.score = graded.score;
    const el = document.querySelector('#colleScore');
    if (el) el.innerHTML = `${fmt(graded.score)}<small> / 20</small>`;
  }
  async function saveSolo(button) {
    button.disabled = true;
    const graded = await core.gradeColle({question: run.question, checked_items: [...run.checked]});
    const {data, error} = await client.from('colle_attempts').insert({question_id: run.question.id, mode: 'solo', prep_seconds: run.prepUsed, pass_seconds: run.passUsed, checked_items: [...run.checked].sort(), score: graded.score}).select('id,score').single();
    if (error) {button.disabled = false; return showToast(friendly(error));}
    run.score = Number(data.score); run.phase = 'done'; render(); showToast('Colle enregistrée'); void refreshMine();
  }
  async function finishDuo(button) {
    button.disabled = true; clearTimeout(pushTimer); pushTimer = null;
    await client.from('colle_sessions').update({checked_items: [...run.checked].sort()}).eq('id', run.session.id);
    const {data, error} = await client.rpc('colle_session_finish', {session: run.session.id, prep_used: run.prepUsed, pass_used: run.passUsed || run.pass});
    if (error) {button.disabled = false; return showToast(friendly(error));}
    applySession(data); render(); showToast('Note envoyée à ton camarade');
  }
  function quit() {
    if (!run) return home();
    if (run.mode === 'solo' && run.phase !== 'done' && !confirm('Abandonner cette colle ? Elle ne sera pas enregistrée.')) return;
    if (run.mode === 'host' && !['done', 'cancelled'].includes(run.phase)) {
      if (!confirm('Arrêter la colle pour vous deux ?')) return;
      void client.from('colle_sessions').update({phase: 'cancelled'}).eq('id', run.session.id);
    }
    home();
  }
  function home() { stopPolling(); clearTimeout(pushTimer); pushTimer = null; run = null; form = null; upgrade = null; view = 'home'; render(); void refreshMine(); }

  /* ---- Views ----------------------------------------------------------------------------------- */
  function chapterResults() {
    const pool = poolFor();
    if (pool.error) return `<p class="colle-muted">${esc(pool.error)}</p>`;
    if (!pool.rows) return '<p class="colle-muted">Chargement des chapitres…</p>';
    const found = core.searchChapters(options(), query);
    if (!found.length) return `<p class="colle-muted">${query ? 'Aucun chapitre trouvé. Essaie un autre mot.' : 'Pas encore de question pour cette matière. Ajoute celles que tu as eues en colle !'}</p>`;
    return found.map(o => `<button type="button" class="colle-option" data-colle-chapter="${esc(o.id)}" ${o.count ? '' : 'disabled'}><span><strong>${esc(o.name)}</strong>${o.aliases.length ? `<small>${esc(o.aliases.join(' · '))}</small>` : ''}</span><em>${o.count ? `${o.count} question${o.count > 1 ? 's' : ''}` : 'Pas encore de question'}</em></button>`).join('');
  }
  function homeView() {
    const opts = options(), selected = opts.find(o => o.id === setup.chapterId);
    const week = core.collesThisWeek(attempts), last = attempts.slice(0, 10);
    const avg = last.length ? last.reduce((n, a) => n + Number(a.score), 0) / last.length : null;
    const limits = plans.limitsOf(profile());
    const c = contribution || {approved: 0, pending: 0, goal: 5};
    const option = (v, l, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`;
    return `<div class="colle-page"><header class="section-head page-header"><div><h1>Colle</h1><p>Entraîne-toi à l’oral.</p></div><div class="colle-head-actions">${admin ? `<button class="secondary-btn" data-colle-moderation>Modération${pendingReview ? ` (${pendingReview})` : ''}</button>` : ''}<button class="secondary-btn" data-colle-submit>Ajouter une question</button></div></header>
      <div class="colle-grid"><section class="card colle-setup"><h2>Prépare ta colle</h2><p class="colle-muted">Choisis le chapitre : Prepago te donne un sujet, chronomètre ta préparation puis ton passage, et te montre ce que le colleur attend.</p>
        <div class="colle-fields"><div class="field"><label for="colleClass">Classe</label><select id="colleClass" data-colle-setup="filiere">${core.CLASSES.map(c => option(c.id, c.id, setup.filiere)).join('')}</select></div>
        <div class="field"><label for="colleSubject">Matière</label><select id="colleSubject" data-colle-setup="subject">${core.SUBJECTS.map(([k, l]) => option(k, l, setup.subject)).join('')}</select></div></div>
        <div class="field colle-chapter-field"><label for="colleChapterSearch">Chapitre</label>${selected ? `<div class="colle-chip"><span><strong>${esc(selected.name)}</strong><small>${selected.count} question${selected.count > 1 ? 's' : ''}</small></span><button type="button" class="link-btn" data-colle-chapter-clear>Changer</button></div>`
          : `<input id="colleChapterSearch" type="search" autocomplete="off" placeholder="Tape le nom du cours, ex. complexes" value="${esc(query)}"><div class="colle-results" id="colleResults">${chapterResults()}</div>`}
          <button type="button" class="link-btn colle-random" data-colle-random>Chapitre au hasard, en priorité tes points faibles</button></div>
        <div class="colle-fields"><div class="field"><label for="collePrep">Préparation</label><select id="collePrep" data-colle-setup="prep">${[0, 3, 5, 10, 15, 20].map(m => option(m, m ? `${m} min` : 'Sans préparation', setup.prep)).join('')}</select></div>
        <div class="field"><label for="collePass">Passage</label><select id="collePass" data-colle-setup="pass">${[10, 15, 20, 25, 30].map(m => option(m, `${m} min`, setup.pass)).join('')}</select></div></div>
        <div class="colle-mode" role="group" aria-label="Mode"><button type="button" data-colle-mode="solo" aria-pressed="${setup.mode === 'solo'}"><strong>Seul</strong><small>Tu te corriges avec la grille du colleur</small></button><button type="button" data-colle-mode="duo" aria-pressed="${setup.mode === 'duo'}"><strong>À deux · tu es le colleur</strong><small>Ton camarade passe la colle sur son téléphone</small></button></div>
        <button class="primary-btn colle-start" data-colle-start ${selected ? '' : 'disabled'}>Lancer la colle</button></section>
      <aside class="colle-rail"><section class="card"><h2>Rejoindre une colle</h2><p class="colle-muted">Ton camarade est le colleur ? Tape le code affiché sur son téléphone.</p><form class="colle-join" data-colle-join><label class="sr-only" for="colleCode">Code à 4 chiffres</label><input id="colleCode" name="code" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]{4}" placeholder="0000" required><button class="secondary-btn" type="submit">Rejoindre</button></form></section>
        <section class="card"><h2>Mes colles</h2><div class="colle-stats"><div><strong>${week}${Number.isFinite(limits.colleSoloPerWeek) ? `<small> / ${limits.colleSoloPerWeek}</small>` : ''}</strong><span>cette semaine</span></div><div><strong>${avg === null ? '—' : `${fmt(avg)}<small> / 20</small>`}</strong><span>moyenne récente</span></div></div>
          ${attempts.slice(0, 5).map(a => `<div class="colle-history-row"><span>${esc(a.colle_questions?.chapter || 'Colle')}<small>${formatShort(String(a.created_at).slice(0, 10))} · ${a.mode === 'duo' ? 'à deux' : 'seul'}</small></span><strong class="${Number(a.score) < core.WEAK ? 'is-low' : ''}">${fmt(a.score)}</strong></div>`).join('') || '<p class="colle-muted">Tes colles apparaîtront ici.</p>'}</section>
        <section class="card colle-contribute"><h2>Enrichis la banque</h2><p class="colle-muted">Ajoute les questions que tu as eues en colle. À ${c.goal} questions acceptées, tu gagnes un mois de Prepago offert.</p>
          <div class="colle-progress-top"><strong>${Math.min(c.approved, c.goal)}/${c.goal} questions acceptées</strong>${c.pending ? `<span>${c.pending} en attente</span>` : ''}</div><span class="colle-bar-track"><span style="width:${Math.min(100, c.approved / c.goal * 100)}%"></span></span>
          ${c.rewarded_at ? '<p class="colle-reward">Mois offert débloqué. Merci pour ta contribution !</p>' : ''}
          <button class="secondary-btn" data-colle-submit>Ajouter une question que j’ai eue en colle</button>
          ${submissions.slice(0, 4).map(s => `<div class="colle-history-row"><span>${esc(s.chapter)}<small>${core.TYPES[s.type] || ''}</small></span><em class="colle-status is-${s.status}">${{pending: 'En attente', approved: 'Acceptée', rejected: 'Refusée'}[s.status]}</em></div>`).join('')}</section></aside></div></div>`;
  }
  function timerCard() {
    const r = run, labels = {ready: 'En attente', prep: 'Préparation', pass: 'Passage', over: 'Temps écoulé', review: 'Correction', done: 'Terminée', cancelled: 'Arrêtée'};
    let actions = '';
    if (r.mode === 'solo') actions = r.phase === 'prep' ? '<button class="secondary-btn" data-colle-skip>Passer au passage</button>' : ['pass', 'over'].includes(r.phase) ? '<button class="primary-btn" data-colle-reveal>Révéler la correction</button>' : '';
    if (r.mode === 'host') actions = r.phase === 'ready' ? '<button class="primary-btn" data-colle-drive="start">Lancer la colle</button>' : r.phase === 'prep' ? '<button class="secondary-btn" data-colle-drive="pass">Passer au passage</button>' : r.phase === 'pass' ? '<button class="primary-btn" data-colle-drive="review">Terminer le passage et noter</button>' : '';
    const left = ['prep', 'pass'].includes(r.phase) ? remaining() : 0;
    return `<section class="card colle-timer" data-phase="${r.phase}"><span class="colle-phase">${labels[r.phase] || ''}</span><strong id="colleClock">${['prep', 'pass'].includes(r.phase) ? core.clock(left) : r.phase === 'over' ? '00:00' : '—'}</strong><span class="colle-bar-track"><span id="colleBar" style="width:${['prep', 'pass'].includes(r.phase) ? Math.min(100, 100 - left / duration(r.phase) * 100) : r.phase === 'over' ? 100 : 0}%"></span></span>
      <small class="colle-muted">Préparation ${Math.round(r.prep / 60)} min · Passage ${Math.round(r.pass / 60)} min</small>${actions ? `<div class="colle-timer-actions">${actions}</div>` : ''}</section>`;
  }
  function questionCard(q) {
    return `<section class="card colle-question"><div class="colle-q-meta"><span class="colle-pill">${core.TYPES[q.type] || 'Question'}</span>${dots(q.difficulty || 2)}</div><div class="colle-statement" data-math>${esc(q.statement)}</div></section>`;
  }
  function correction() {
    const q = run.question, host = run.mode === 'host';
    return `<section class="card colle-checklist"><div class="colle-check-head"><h2>Ce que le colleur attend</h2><strong id="colleScore">${fmt(run.score || 0)}<small> / 20</small></strong></div><p class="colle-muted">${host ? 'Coche ce que ton camarade a réussi : il voit sa note à la fin.' : 'Coche honnêtement ce que tu as su faire : ta note se calcule toute seule.'}</p>
      ${q.checklist.map((item, i) => `<label class="colle-check"><input type="checkbox" data-colle-check="${i}" ${run.checked.has(i) ? 'checked' : ''} ${run.phase === 'done' ? 'disabled' : ''}><span data-math>${esc(item.label)}</span><em>${fmt(item.points)} pt${Number(item.points) > 1 ? 's' : ''}</em></label>`).join('')}</section>
      ${q.traps?.length ? `<section class="card colle-traps"><h2>Les pièges du colleur</h2><p class="colle-muted">${host ? 'Pose ces questions à ton camarade.' : 'Les questions que le colleur pourrait enchaîner. Réponds dans ta tête, puis vérifie.'}</p>${q.traps.map((t, i) => `<div class="colle-trap"><p data-math>${esc(t.question)}</p><div class="colle-trap-answer" ${run.traps.has(i) || host ? '' : 'hidden'} data-math>${esc(t.answer)}</div>${host || run.traps.has(i) ? '' : `<button type="button" class="link-btn" data-colle-trap="${i}">Voir la réponse</button>`}</div>`).join('')}</section>` : ''}`;
  }
  function runView() {
    const r = run, q = r.question;
    const head = `<header class="section-head page-header"><div><h1>${r.mode === 'guest' ? 'Colle à deux' : 'Colle'} · ${esc(r.chapter)}</h1></div><button class="secondary-btn" data-colle-quit>${r.phase === 'done' || r.phase === 'cancelled' ? 'Retour' : r.mode === 'guest' ? 'Quitter' : r.mode === 'host' ? 'Arrêter la colle' : 'Abandonner'}</button></header>`;
    if (r.phase === 'done') {
      return `<div class="colle-page">${head}<section class="card colle-result"><span class="colle-phase">${r.mode === 'host' ? 'Note de ton camarade' : 'Ta note'}</span><strong class="${r.score < core.WEAK ? 'is-low' : ''}">${fmt(r.score)}<small> / 20</small></strong>
        ${r.mode === 'solo' ? `<p class="colle-muted">Préparation ${core.clock(r.prepUsed)} · Passage ${core.clock(r.passUsed)}</p>` : `<p class="colle-muted">${r.mode === 'guest' ? 'Ta note est enregistrée dans Mes colles.' : 'La note est enregistrée sur le compte de ton camarade.'}</p>`}
        <div class="colle-timer-actions">${r.mode === 'guest' ? '' : '<button class="primary-btn" data-colle-again>Nouvelle colle sur ce chapitre</button>'}<button class="secondary-btn" data-colle-home>Retour</button></div></section>${r.mode === 'guest' ? '' : questionCard(q) + correction()}</div>`;
    }
    if (r.phase === 'cancelled') return `<div class="colle-page">${head}<section class="card colle-result"><span class="colle-phase">Colle arrêtée</span><p>${r.mode === 'guest' ? 'Le colleur a arrêté la colle.' : 'La colle est arrêtée.'}</p><button class="secondary-btn" data-colle-home>Retour</button></section></div>`;
    if (r.mode === 'host' && ['waiting', 'ready'].includes(r.phase)) {
      return `<div class="colle-page">${head}<div class="colle-run-grid"><section class="card colle-code"><span class="colle-phase">Code de la colle</span><strong>${esc(r.session.code)}</strong><p>${r.phase === 'waiting' ? 'Ton camarade ouvre <b>Colle</b>, puis <b>Rejoindre une colle</b>, et tape ce code.' : 'Ton camarade est connecté.'}</p>${r.phase === 'waiting' ? '<p class="colle-muted colle-waiting">En attente de l’étudiant…</p>' : '<button class="primary-btn" data-colle-drive="start">Lancer la colle</button>'}</section>${questionCard(q)}${correction()}</div></div>`;
    }
    if (r.mode === 'guest') {
      const message = {waiting: 'Le colleur prépare la colle.', ready: 'Le colleur va lancer la colle.', review: 'Le colleur note ta colle…'}[r.phase];
      return `<div class="colle-page">${head}<div class="colle-run-grid">${message ? `<section class="card colle-result"><span class="colle-phase">Colle à deux</span><p>${message}</p></section>` : timerCard() + questionCard(q)}</div></div>`;
    }
    const reviewing = r.mode === 'host' || r.phase === 'review';
    return `<div class="colle-page">${head}<div class="colle-run-grid">${r.phase === 'review' ? '' : timerCard()}${questionCard(q)}${reviewing ? correction() : ''}
      ${r.phase === 'review' ? `<div class="colle-save">${r.mode === 'host' ? '<button class="primary-btn" data-colle-finish>Terminer et envoyer la note</button>' : '<button class="primary-btn" data-colle-save>Enregistrer ma colle</button>'}</div>` : ''}</div></div>`;
  }

  /* ---- Submission form (students) and edition (admin) ----------------------------------------- */
  function blankForm() {
    return {id: null, filiere: setup.filiere, subject: setup.subject, chapter_key: '', chapter: '', type: 'exercice', difficulty: 2, statement: '',
      checklist: [{label: '', points: 5}, {label: '', points: 5}, {label: '', points: 5}, {label: '', points: 5}], traps: [{question: '', answer: ''}, {question: '', answer: ''}], status: 'pending'};
  }
  function readForm() {
    const f = document.querySelector('#colleForm');
    if (!f || !form) return;
    const v = Object.fromEntries(new FormData(f));
    form = {...form, filiere: v.filiere, subject: v.subject, chapter_key: v.chapter_key || '', chapter: v.chapter_label || '', type: v.type, difficulty: v.difficulty, statement: v.statement,
      checklist: [...f.querySelectorAll('[data-check-row]')].map(row => ({label: row.querySelector('[name=checkLabel]').value, points: row.querySelector('[name=checkPoints]').value})),
      traps: [...f.querySelectorAll('[data-trap-row]')].map(row => ({question: row.querySelector('[name=trapQuestion]').value, answer: row.querySelector('[name=trapAnswer]').value}))};
  }
  function formView() {
    const f = form, chapters = core.catalogChapters(catalog(), f.filiere, f.subject), editingAdmin = admin && f.id;
    const option = (v, l, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
    return `<div class="colle-page"><header class="section-head page-header"><div><h1>${editingAdmin ? 'Modifier la question' : 'Ajouter une question'}</h1></div><button class="secondary-btn" data-colle-${editingAdmin ? 'moderation' : 'home'}>Retour</button></header>
      <form class="card colle-form" id="colleForm" novalidate>${editingAdmin ? '' : '<p class="colle-muted">Tu as eu une question intéressante en colle ? Partage-la : elle rejoint la banque après validation par l’équipe Prepago.</p>'}
        <div class="colle-fields colle-fields-3"><div class="field"><label for="cfClass">Classe</label><select id="cfClass" name="filiere" data-colle-form-refresh>${core.CLASSES.map(c => option(c.id, c.id, f.filiere)).join('')}</select></div>
        <div class="field"><label for="cfSubject">Matière</label><select id="cfSubject" name="subject" data-colle-form-refresh>${core.SUBJECTS.map(([k, l]) => option(k, l, f.subject)).join('')}</select></div>
        <div class="field"><label for="cfType">Type</label><select id="cfType" name="type">${Object.entries(core.TYPES).map(([k, l]) => option(k, l, f.type)).join('')}</select></div></div>
        <div class="colle-fields"><div class="field"><label for="cfChapter">Chapitre du programme</label><select id="cfChapter" name="chapter_key"><option value="">Autre chapitre</option>${chapters.map(c => option(c.key, c.name, f.chapter_key)).join('')}</select></div>
        <div class="field"><label for="cfChapterLabel">Nom du chapitre tel qu’en cours ${f.chapter_key ? '(facultatif)' : ''}</label><input id="cfChapterLabel" name="chapter_label" maxlength="160" value="${esc(f.chapter)}" placeholder="Ex. Nombres complexes"></div></div>
        <div class="field"><label for="cfDifficulty">Difficulté</label><select id="cfDifficulty" name="difficulty">${[[1, 'Facile'], [2, 'Moyenne'], [3, 'Difficile']].map(([k, l]) => option(k, l, f.difficulty)).join('')}</select></div>
        <div class="field"><label for="cfStatement">Énoncé</label><textarea id="cfStatement" name="statement" rows="5" maxlength="6000" placeholder="Écris les formules entre $ : $z^n = 1$">${esc(f.statement)}</textarea><div class="colle-preview" id="colleStatementPreview" data-math>${esc(f.statement)}</div></div>
        <fieldset class="colle-rows"><legend>Ce que le colleur attend <small>3 à 6 éléments, avec les points de chacun</small></legend>${f.checklist.map((c, i) => `<div class="colle-row" data-check-row><input name="checkLabel" aria-label="Élément ${i + 1}" maxlength="300" value="${esc(c.label)}" placeholder="Ex. Calcul du discriminant"><input name="checkPoints" aria-label="Points de l’élément ${i + 1}" type="number" min="0.5" max="20" step="0.5" value="${esc(c.points)}"><button type="button" class="link-btn" data-colle-row-remove="check:${i}" ${f.checklist.length <= 3 ? 'disabled' : ''}>Retirer</button></div>`).join('')}
          ${f.checklist.length < 6 ? '<button type="button" class="link-btn" data-colle-row-add="check">+ Élément</button>' : ''}</fieldset>
        <fieldset class="colle-rows"><legend>Les pièges du colleur <small>Questions qu’il enchaîne, avec une réponse courte</small></legend>${f.traps.map((t, i) => `<div class="colle-row colle-row-trap" data-trap-row><input name="trapQuestion" aria-label="Piège ${i + 1}" maxlength="500" value="${esc(t.question)}" placeholder="Question"><input name="trapAnswer" aria-label="Réponse du piège ${i + 1}" maxlength="1000" value="${esc(t.answer)}" placeholder="Réponse courte"><button type="button" class="link-btn" data-colle-row-remove="trap:${i}">Retirer</button></div>`).join('')}
          ${f.traps.length < 3 ? '<button type="button" class="link-btn" data-colle-row-add="trap">+ Piège</button>' : ''}</fieldset>
        <div class="colle-form-actions">${editingAdmin ? '<button type="button" class="secondary-btn" data-colle-review="rejected">Refuser</button><button type="button" class="secondary-btn" data-colle-review="save">Enregistrer</button><button type="button" class="primary-btn" data-colle-review="approved">Enregistrer et accepter</button>' : '<button type="submit" class="primary-btn">Envoyer pour validation</button>'}</div></form></div>`;
  }
  function formValues() {
    readForm();
    const chapterName = form.chapter.trim() || core.catalogChapters(catalog(), form.filiere, form.subject).find(c => c.key === form.chapter_key)?.name || '';
    return core.normalizeQuestion({...form, chapter: chapterName, chapter_key: form.chapter_key || null});
  }
  async function submitQuestion(button) {
    const row = formValues();
    if (row.error) return showToast(row.error);
    button.disabled = true;
    const {error} = await client.from('colle_questions').insert(row);
    button.disabled = false;
    if (error) return showToast(friendly(error));
    showToast('Question envoyée. Elle rejoindra la banque après validation.');
    home();
  }

  /* ---- Moderation (admin) ---------------------------------------------------------------------- */
  async function loadModeration() {
    moderation.loading = true; render();
    const g = generation;
    const [q, b] = await Promise.all([
      client.from('colle_questions').select(QUESTION_FIELDS).eq('status', 'pending').order('created_at', {ascending: true}).limit(200),
      client.from('exam_baremes').select('id,paper_id,questions,status,author_user_id,created_at').eq('status', 'pending').order('created_at', {ascending: true}).limit(200)
    ]);
    if (g !== generation) return;
    moderation.questions = q.data || []; moderation.baremes = b.data || [];
    const ids = [...new Set(moderation.baremes.map(x => x.paper_id))];
    if (ids.length) {
      const p = await client.from('cnc_exams').select('id,filiere,subject,year').in('id', ids);
      (p.data || []).forEach(x => moderation.papers.set(x.id, x));
    }
    moderation.loading = false; pendingReview = moderation.questions.length + moderation.baremes.length;
    if (currentPage === 'colle' && view === 'moderation') render();
  }
  const paperLabel = p => p ? `${typeof cncContest === 'function' ? cncContest(p.filiere) : 'CNC'} ${p.filiere} · ${p.subject} · ${p.year}` : 'Épreuve';
  function moderationView() {
    const m = moderation, tabs = [['questions', `Questions de colle (${m.questions.length})`], ['baremes', `Barèmes (${m.baremes.length})`]];
    const list = m.loading ? '<p class="colle-muted">Chargement…</p>' : m.tab === 'questions'
      ? m.questions.map(q => `<article class="card colle-mod-card"><div class="colle-q-meta"><span class="colle-pill">${core.TYPES[q.type]}</span><span>${esc(q.filiere)} · ${esc(core.subjectName(q.subject))} · ${esc(q.chapter)}</span>${dots(q.difficulty)}</div><div class="colle-statement" data-math>${esc(q.statement)}</div>
          <ul class="colle-mod-list">${q.checklist.map(i => `<li><span data-math>${esc(i.label)}</span><em>${fmt(i.points)} pts</em></li>`).join('')}</ul>${q.traps.length ? `<ul class="colle-mod-list">${q.traps.map(t => `<li><span data-math>${esc(t.question)}</span><em data-math>${esc(t.answer)}</em></li>`).join('')}</ul>` : ''}
          <div class="colle-form-actions"><button class="secondary-btn" data-colle-mod-question="${esc(q.id)}|rejected">Refuser</button><button class="secondary-btn" data-colle-mod-edit="${esc(q.id)}">Modifier</button><button class="primary-btn" data-colle-mod-question="${esc(q.id)}|approved">Accepter</button></div></article>`).join('') || '<p class="colle-muted">Aucune question en attente.</p>'
      : m.baremes.map(b => {const total = b.questions.reduce((n, x) => n + Number(x.max_points), 0); return `<article class="card colle-mod-card"><div class="colle-q-meta"><strong>${esc(paperLabel(m.papers.get(b.paper_id)))}</strong><span>${b.questions.length} questions · ${fmt(total)} points</span></div>
          <table class="colle-bareme"><thead><tr><th>Question</th><th>Intitulé</th><th>Chapitre</th><th>Points</th></tr></thead><tbody>${b.questions.map(x => `<tr><td>${esc(x.number)}</td><td>${esc(x.label || '')}</td><td>${esc(x.chapter || '')}</td><td>${fmt(x.max_points)}</td></tr>`).join('')}</tbody></table>
          <div class="colle-form-actions"><button class="secondary-btn" data-colle-mod-bareme="${esc(b.id)}|rejected">Refuser</button><button class="primary-btn" data-colle-mod-bareme="${esc(b.id)}|approved">Accepter</button></div></article>`;}).join('') || '<p class="colle-muted">Aucun barème en attente.</p>';
    return `<div class="colle-page"><header class="section-head page-header"><div><h1>Modération</h1></div><button class="secondary-btn" data-colle-home>Retour</button></header>
      <div class="colle-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${m.tab === k}" data-colle-mod-tab="${k}">${l}</button>`).join('')}</div><div class="colle-mod">${list}</div></div>`;
  }
  async function review(table, id, status, values = {}) {
    const {error} = await client.from(table).update({...values, ...(status === 'save' ? {} : {status})}).eq('id', id);
    if (error) return showToast(friendly(error));
    showToast(status === 'approved' ? 'Accepté' : status === 'rejected' ? 'Refusé' : 'Enregistré');
    pools.clear(); form = null; view = 'moderation'; void loadModeration();
  }

  /* ---- Page ------------------------------------------------------------------------------------ */
  function renderColle() {
    if (!setup) setup = loadSetup();
    const page = document.querySelector('#page');
    page.innerHTML = view === 'run' && run ? runView() : view === 'upgrade' && upgrade ? `<div class="colle-page"><header class="section-head page-header"><div><h1>Colle</h1></div></header>${window.PrepagoUpgrade.html(upgrade, 'data-colle-home')}</div>`
      : view === 'submit' && form ? formView() : view === 'moderation' && admin ? moderationView() : homeView();
    typeset(page);
    if (view === 'run') startTick();
  }
  const baseRender = render;
  render = function () {
    if (currentPage !== 'colle') return baseRender();
    window.PrepagoFocus?.leaveImmersive();
    renderColle();
    document.body.dataset.page = 'colle';
    document.body.classList.remove('focus-cockpit-immersive');
    document.querySelectorAll('.nav-item').forEach(n => {n.classList.toggle('active', n.dataset.page === 'colle'); if (n.dataset.page === 'colle') n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');});
    refreshIcons(); updateSidebar();
  };

  document.addEventListener('click', e => {
    if (currentPage !== 'colle') return;
    const b = e.target.closest('button'); if (!b || b.disabled) return; const d = b.dataset;
    if ('colleStart' in d) void start();
    if ('colleRandom' in d) void start(true);
    if (d.colleChapter) {setup.chapterId = d.colleChapter; query = ''; saveSetup(); render();}
    if ('colleChapterClear' in d) {setup.chapterId = null; saveSetup(); render(); document.querySelector('#colleChapterSearch')?.focus();}
    if (d.colleMode) {setup.mode = d.colleMode; saveSetup(); render();}
    if ('colleSkip' in d) {setPhase('pass'); render();}
    if ('colleReveal' in d) {setPhase('review'); render(); void updateScore();}
    if (d.colleTrap) {run.traps.add(Number(d.colleTrap)); render();}
    if ('colleSave' in d) void saveSolo(b);
    if ('colleFinish' in d) void finishDuo(b);
    if (d.colleDrive) void drive(d.colleDrive === 'start' ? (run.prep ? 'prep' : 'pass') : d.colleDrive);
    if ('colleQuit' in d) quit();
    if ('colleHome' in d) home();
    if ('colleAgain' in d) {stopPolling(); run = null; view = 'home'; void start();}
    if ('colleSubmit' in d) {form = blankForm(); view = 'submit'; render();}
    if (d.colleRowAdd) {readForm(); form[d.colleRowAdd === 'check' ? 'checklist' : 'traps'].push(d.colleRowAdd === 'check' ? {label: '', points: 4} : {question: '', answer: ''}); render();}
    if (d.colleRowRemove) {readForm(); const [k, i] = d.colleRowRemove.split(':'); form[k === 'check' ? 'checklist' : 'traps'].splice(Number(i), 1); render();}
    if (d.colleReview) {const row = formValues(); if (row.error) return showToast(row.error); void review('colle_questions', form.id, d.colleReview, row);}
    if ('colleModeration' in d && admin) {form = null; view = 'moderation'; void loadModeration();}
    if (d.colleModTab) {moderation.tab = d.colleModTab; render();}
    if (d.colleModQuestion) {const [id, status] = d.colleModQuestion.split('|'); void review('colle_questions', id, status);}
    if (d.colleModBareme) {const [id, status] = d.colleModBareme.split('|'); void review('exam_baremes', id, status);}
    if (d.colleModEdit) {const q = moderation.questions.find(x => x.id === d.colleModEdit); if (q) {form = {...q, chapter_key: q.chapter_key || '', checklist: q.checklist.map(x => ({...x})), traps: q.traps.map(x => ({...x}))}; view = 'submit'; render();}}
  });
  document.addEventListener('change', e => {
    if (currentPage !== 'colle') return;
    const t = e.target;
    if (t.dataset.colleSetup) {setup[t.dataset.colleSetup] = t.value; if (['filiere', 'subject'].includes(t.dataset.colleSetup)) {setup.chapterId = null; query = '';} saveSetup(); render();}
    if (t.matches('[data-colle-form-refresh]')) {readForm(); form.chapter_key = ''; render();}
    if (t.matches('[data-colle-check]') && run) {const i = Number(t.dataset.colleCheck); if (t.checked) run.checked.add(i); else run.checked.delete(i); void updateScore(); if (run.mode === 'host') pushChecks();}
  });
  let previewTimer = null;
  document.addEventListener('input', e => {
    if (currentPage !== 'colle') return;
    if (e.target.id === 'colleChapterSearch') {query = e.target.value; const list = document.querySelector('#colleResults'); if (list) list.innerHTML = chapterResults();}
    if (e.target.id === 'cfStatement') {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => {const p = document.querySelector('#colleStatementPreview'); if (!p) return; p.removeAttribute('data-math-done'); p.textContent = e.target.value; typeset(p.parentElement);}, 300);
    }
  });
  document.addEventListener('submit', e => {
    if (currentPage !== 'colle') return;
    if (e.target.matches('[data-colle-join]')) {e.preventDefault(); void join(e.target.elements.code.value.trim());}
    if (e.target.id === 'colleForm') {e.preventDefault(); void submitQuestion(e.submitter || e.target.querySelector('[type=submit]'));}
  });
  window.addEventListener('beforeunload', e => {if (run && ['prep', 'pass'].includes(run.phase)) {e.preventDefault(); e.returnValue = '';}});

  function connect(c, id, isAdmin) {
    generation++; stopPolling(); client = c; userId = id; admin = !!isAdmin;
    pools.clear(); attempts = []; contribution = null; submissions = []; pendingReview = 0;
    run = null; form = null; upgrade = null; view = 'home'; query = ''; setup = loadSetup();
    void refreshMine();
    if (currentPage === 'colle') render();
  }
  function clear() {
    generation++; stopPolling(); clearTimeout(pushTimer); pushTimer = null; client = null; userId = null; admin = false;
    pools.clear(); attempts = []; contribution = null; submissions = []; run = null; form = null; upgrade = null; view = 'home'; setup = null;
  }
  window.PrepagoColle = {connect, clear, typeset, loadMath};
})();
