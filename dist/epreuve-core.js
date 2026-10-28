/* Mode Épreuve: exam clock, barèmes, grading and statistics. Pure helpers, no DOM.
   gradeExam() is the single grading entry point: self-assessed today, an AI grader later. */
(function (root) {
  const DURATIONS = [120, 180, 240];
  const DEFAULT_MINUTES = 240, WEAK = 0.5, WEAK_CHAPTER = 0.75;
  const contestOf = filiere => ['ECS', 'ECT'].includes(filiere) ? 'CNAEM' : 'CNC';
  /* Subjects grouped by family, in a fixed order: the order gives each family its chart colour. */
  const FAMILIES = [['Mathématiques', /math/i], ['Physique', /phys/i], ['Chimie', /chim/i], ['Sciences industrielles', /sciences ind|^si\b|industri/i], ['Informatique', /inform/i],
    ['Langues', /fran|anglais|arab|langue|english/i], ['Économie et gestion', /écon|econ|gestion|management|droit/i]];
  /* Seven families plus "Autres" fill the eight chart colours; a ninth never gets a new colour. */
  const familyOf = subject => (FAMILIES.find(([, re]) => re.test(subject || '')) || ['Autres'])[0];
  const defaultMinutes = paper => DURATIONS.includes(paper?.duration_minutes) ? paper.duration_minutes : paper?.duration_minutes || DEFAULT_MINUTES;

  /* Running exam: {startedAt, durationSeconds, pausedAt, pausedTotal, pauses} in ms / seconds. */
  function usedSeconds(run, now = Date.now()) {
    const paused = run.pausedTotal + (run.pausedAt ? now - run.pausedAt : 0);
    return Math.max(0, Math.floor((now - run.startedAt - paused) / 1000));
  }
  const leftSeconds = (run, now = Date.now()) => Math.max(0, run.durationSeconds - usedSeconds(run, now));
  function pause(run, now = Date.now()) { return run.pausedAt ? run : {...run, pausedAt: now, pauses: run.pauses + 1}; }
  function resume(run, now = Date.now()) { return run.pausedAt ? {...run, pausedAt: null, pausedTotal: run.pausedTotal + (now - run.pausedAt)} : run; }
  function clock(seconds) {
    const s = Math.max(0, Math.floor(seconds)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  /* Barème rows from the form → {questions} or {error}. */
  function normalizeBareme(rows) {
    const questions = rows.map(r => ({number: String(r.number || '').trim().slice(0, 12), label: String(r.label || '').trim().slice(0, 200) || null,
      max_points: Number(String(r.max_points).replace(',', '.')), chapter: String(r.chapter || '').trim().slice(0, 160) || null}));
    if (!questions.length) return {error: 'Ajoute au moins une question.'};
    if (questions.length > 60) return {error: 'Soixante questions au maximum.'};
    if (questions.some(q => !q.number)) return {error: 'Chaque question a un numéro.'};
    if (questions.some(q => !(q.max_points >= 0.25 && q.max_points <= 100))) return {error: 'Chaque question vaut entre 0,25 et 100 points.'};
    return {questions};
  }
  function evenBareme(count, points) {
    const n = Math.min(60, Math.max(1, Math.round(Number(count) || 0))), p = Number(String(points).replace(',', '.')) || 1;
    return Array.from({length: n}, (_, i) => ({number: String(i + 1), label: '', max_points: p, chapter: ''}));
  }

  /* Grading entry point. attempt: {questions: barème rows, points: [number per question]}. */
  async function gradeExam(attempt) {
    const questions = attempt.questions || [];
    const scores = questions.map((q, i) => {
      const max = Number(q.max_points), raw = Number(String(attempt.points?.[i] ?? '').replace(',', '.'));
      return {number: q.number, chapter: q.chapter || null, max_points: max, points: Number.isFinite(raw) ? Math.min(max, Math.max(0, raw)) : 0};
    });
    const max = scores.reduce((n, s) => n + s.max_points, 0), got = scores.reduce((n, s) => n + s.points, 0);
    return {scores, earned: got, total: max, total_20: max ? Math.round(got / max * 2000) / 100 : null, grading_method: 'self', ai_feedback: null};
  }

  /* Score series per subject family, oldest first. */
  function series(attempts, papers) {
    const out = new Map();
    attempts.filter(a => a.total_20 !== null && a.total_20 !== undefined).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).forEach(a => {
      const paper = papers.get(a.paper_id), family = familyOf(paper?.subject);
      if (!out.has(family)) out.set(family, []);
      out.get(family).push({date: a.created_at, value: Number(a.total_20), attempt: a, paper});
    });
    return FAMILIES.map(([f]) => f).concat('Autres').filter(f => out.has(f)).map(f => ({family: f, slot: FAMILIES.findIndex(([x]) => x === f) + 1 || 8, points: out.get(f)}));
  }
  /* Weakest chapters and questions: lowest share of points obtained. */
  function weakest(attempts, papers, limit = 5) {
    const chapters = new Map(), questions = [];
    attempts.forEach(a => (a.scores || []).forEach(s => {
      const ratio = s.max_points ? s.points / s.max_points : 0, paper = papers.get(a.paper_id);
      questions.push({label: `Question ${s.number}`, paper, ratio, points: s.points, max: s.max_points, date: a.created_at});
      if (s.chapter) {const c = chapters.get(s.chapter) || {chapter: s.chapter, got: 0, max: 0, count: 0}; c.got += s.points; c.max += s.max_points; c.count++; chapters.set(s.chapter, c);}
    }));
    return {
      chapters: [...chapters.values()].map(c => ({...c, ratio: c.max ? c.got / c.max : 0})).filter(c => c.ratio < WEAK_CHAPTER).sort((a, b) => a.ratio - b.ratio).slice(0, limit),
      questions: questions.filter(q => q.ratio < WEAK).sort((a, b) => a.ratio - b.ratio || String(b.date).localeCompare(String(a.date))).slice(0, limit)
    };
  }
  root.PrepagoEpreuveCore = {DURATIONS, DEFAULT_MINUTES, FAMILIES, contestOf, familyOf, defaultMinutes, usedSeconds, leftSeconds, pause, resume, clock, normalizeBareme, evenBareme, gradeExam, series, weakest};
  if (typeof module !== 'undefined') module.exports = root.PrepagoEpreuveCore;
})(typeof window !== 'undefined' ? window : globalThis);
