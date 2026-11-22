/* Simulateur de colle: question choice, chapter search and grading. Pure helpers, no DOM.
   gradeColle() is the single grading entry point: self-assessed today, an AI grader later. */
(function (root) {
  const CLASSES = [
    {id: 'MPSI', track: 'MP', levels: ['sup']}, {id: 'PCSI', track: 'PSI', levels: ['sup']},
    {id: 'MP', track: 'MP', levels: ['spe']}, {id: 'PSI', track: 'PSI', levels: ['spe']},
    {id: 'TSI', track: 'TSI', levels: ['sup', 'spe']}
  ];
  const SUBJECTS = [['math', 'Mathématiques'], ['physics', 'Physique'], ['chemistry', 'Chimie'], ['engineering', 'Sciences industrielles']];
  const CATALOG_SUBJECTS = {math: ['math'], physics: ['physics'], chemistry: ['chemistry'], engineering: ['engineering', 'electrical-engineering', 'mechanical-engineering']};
  const TYPES = {cours: 'Question de cours', exercice: 'Exercice'};
  const RECENT_DAYS = 3, WEAK = 10;
  const subjectName = key => (SUBJECTS.find(([k]) => k === key) || [key, key])[1];
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  /* Default class for a profile filière: Sup by default, the student can switch. */
  function defaultClass(filiere) { return {MP: 'MPSI', PSI: 'PCSI', TSI: 'TSI'}[filiere] || 'MPSI'; }
  /* Chapters of the official programme for a class and subject, from the curriculum catalogue. */
  function catalogChapters(catalog, classId, subject) {
    const cls = CLASSES.find(c => c.id === classId), track = cls && catalog?.tracks?.[cls.track];
    if (!track) return [];
    return track.subjects.filter(s => (CATALOG_SUBJECTS[subject] || []).includes(s.key))
      .flatMap(s => s.chapters.filter(c => cls.levels.includes(c.studyLevel)).map(c => ({key: c.key, name: c.name, level: c.studyLevel})));
  }
  /* Programme chapters plus chapter names used by questions, each with its question count. */
  function chapterOptions(catalog, classId, subject, questions) {
    const counts = new Map(), labels = new Map();
    questions.forEach(q => {
      const id = q.chapter_key || 'label:' + fold(q.chapter);
      counts.set(id, (counts.get(id) || 0) + 1);
      if (!labels.has(id)) labels.set(id, new Set());
      labels.get(id).add(q.chapter);
    });
    const options = catalogChapters(catalog, classId, subject).map(c => ({id: c.key, key: c.key, name: c.name, aliases: [...(labels.get(c.key) || [])].filter(l => fold(l) !== fold(c.name)), count: counts.get(c.key) || 0}));
    const known = new Set(options.map(o => o.id));
    counts.forEach((count, id) => {
      if (known.has(id)) return;
      const name = [...labels.get(id)][0];
      options.push({id, key: id.startsWith('label:') ? null : id, name, aliases: [], count});
    });
    return options;
  }
  function searchChapters(options, query, limit = 8) {
    const words = fold(query).split(/\s+/).filter(Boolean);
    const hit = o => words.every(w => fold([o.name, ...o.aliases].join(' ')).includes(w));
    return options.filter(o => !words.length ? o.count > 0 : hit(o))
      .sort((a, b) => (b.count > 0) - (a.count > 0) || a.name.localeCompare(b.name, 'fr'))
      .slice(0, limit);
  }
  const inChapter = (q, option) => option.key ? q.chapter_key === option.key : 'label:' + fold(q.chapter) === option.id;

  /* Avoid the last question and those seen in the last 3 days, then favour questions scored under 10 and new questions. */
  function pickQuestion(questions, attempts, {now = Date.now(), random = Math.random} = {}) {
    if (!questions.length) return null;
    const mine = attempts.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const recent = new Set(mine.slice(0, 1).map(a => a.question_id)
      .concat(mine.filter(a => now - new Date(a.created_at).getTime() < RECENT_DAYS * 864e5).map(a => a.question_id)));
    const last = new Map(); mine.forEach(a => { if (!last.has(a.question_id)) last.set(a.question_id, a); });
    let pool = questions.filter(q => !recent.has(q.id));
    if (!pool.length) {
      const seen = q => last.get(q.id) ? new Date(last.get(q.id).created_at).getTime() : 0;
      const oldest = Math.min(...questions.map(seen));
      pool = questions.filter(q => seen(q) === oldest);
    }
    const weight = q => !last.has(q.id) ? 2 : Number(last.get(q.id).score) < WEAK ? 3 : 1;
    return weighted(pool, weight, random);
  }
  /* "Chapitre au hasard": favour chapters with a low average, then chapters never tried. */
  function pickChapter(options, questions, attempts, random = Math.random) {
    const available = options.filter(o => o.count > 0);
    if (!available.length) return null;
    const chapterOf = new Map(questions.map(q => [q.id, available.find(o => inChapter(q, o))?.id]));
    const scores = new Map();
    attempts.forEach(a => { const id = chapterOf.get(a.question_id); if (id) scores.set(id, [...(scores.get(id) || []), Number(a.score)]); });
    const weight = o => { const s = scores.get(o.id); return !s ? 2 : s.reduce((n, v) => n + v, 0) / s.length < WEAK ? 4 : 1; };
    return weighted(available, weight, random);
  }
  function weighted(items, weight, random) {
    const total = items.reduce((n, i) => n + weight(i), 0);
    let r = random() * total;
    for (const item of items) { r -= weight(item); if (r < 0) return item; }
    return items[items.length - 1];
  }

  /* Grading entry point. attempt: {question: {checklist}, checked_items: [indexes]}.
     Returns what is saved with the attempt; the database recomputes the same self score. */
  async function gradeColle(attempt) {
    const items = attempt.question?.checklist || [], ticked = new Set(attempt.checked_items || []);
    const total = items.reduce((n, i) => n + Number(i.points), 0);
    const earned = items.reduce((n, i, idx) => n + (ticked.has(idx) ? Number(i.points) : 0), 0);
    return {score: total ? Math.round(earned / total * 2000) / 100 : 0, earned, total, grading_method: 'self', ai_feedback: null};
  }

  function weekStart(now = new Date()) {
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    return d;
  }
  const collesThisWeek = (attempts, now = new Date()) => attempts.filter(a => a.mode === 'solo' && new Date(a.created_at) >= weekStart(now)).length;
  const clock = seconds => {
    const s = Math.max(0, Math.round(seconds));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  /* Form values → a question row for colle_questions, or {error}. */
  function normalizeQuestion(v) {
    const checklist = (v.checklist || []).map(i => ({label: String(i.label || '').trim(), points: Number(String(i.points).replace(',', '.'))})).filter(i => i.label);
    const traps = (v.traps || []).map(t => ({question: String(t.question || '').trim(), answer: String(t.answer || '').trim()})).filter(t => t.question || t.answer);
    if (!CLASSES.some(c => c.id === v.filiere)) return {error: 'Choisis la classe.'};
    if (!SUBJECTS.some(([k]) => k === v.subject)) return {error: 'Choisis la matière.'};
    if (!String(v.chapter || '').trim()) return {error: 'Indique le chapitre.'};
    if (!TYPES[v.type]) return {error: 'Choisis le type de question.'};
    if (String(v.statement || '').trim().length < 5) return {error: 'Écris l’énoncé de la question.'};
    if (checklist.length < 3 || checklist.length > 6) return {error: 'Le colleur attend entre 3 et 6 éléments.'};
    if (checklist.some(i => !(i.points >= 0.5 && i.points <= 20))) return {error: 'Chaque élément vaut entre 0,5 et 20 points.'};
    if (traps.some(t => !t.question || !t.answer)) return {error: 'Chaque piège a une question et une réponse.'};
    if (traps.length > 3) return {error: 'Trois pièges au maximum.'};
    return {
      filiere: v.filiere, subject: v.subject, chapter: String(v.chapter).trim().slice(0, 160), chapter_key: v.chapter_key || null,
      type: v.type, statement: String(v.statement).trim().slice(0, 6000), difficulty: Math.min(3, Math.max(1, Number(v.difficulty) || 2)),
      checklist, traps
    };
  }

  root.PrepagoColleCore = {CLASSES, SUBJECTS, TYPES, WEAK, subjectName, fold, defaultClass, catalogChapters, chapterOptions, searchChapters, inChapter, pickQuestion, pickChapter, gradeColle, weekStart, collesThisWeek, clock, normalizeQuestion};
  if (typeof module !== 'undefined') module.exports = root.PrepagoColleCore;
})(typeof window !== 'undefined' ? window : globalThis);
