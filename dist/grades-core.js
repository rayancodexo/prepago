/* Colles and DS, kept in the account state as state.grades. A record is planned before the
   exam (date, chapters it covers) and graded after it. Pure helpers, no DOM. */
(function (root) {
  const kinds = [['colle','Colle'],['ds','DS'],['dm','DM'],['blanc','Concours blanc']];
  const LIMIT = 600, NOTE_MAX = 400, WEAK = 10, STEPS = 5;
  const kindLabel = key => (kinds.find(([k]) => k === key) || kinds[0])[1];
  const number = value => {
    const n = Number(String(value ?? '').replace(',', '.').trim());
    return String(value ?? '').trim() !== '' && Number.isFinite(n) ? n : null;
  };
  const round = (n, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const on20 = g => g.score / g.outOf * 20;
  const isGraded = g => typeof g.score === 'number' && Number.isFinite(g.score);
  /* Records saved before chapters became a list carry a single chapterId. */
  const chapterIdsOf = g => Array.isArray(g.chapterIds) ? g.chapterIds : g.chapterId ? [g.chapterId] : [];
  function list(state) { return Array.isArray(state.grades) ? state.grades : []; }
  /* 'upcoming' before the exam, 'toGrade' once it is over without a grade, 'graded' after. */
  function status(g, now = new Date()) {
    if (isGraded(g)) return 'graded';
    const today = iso(now);
    if (g.date > today) return 'upcoming';
    if (g.date === today && g.time && g.time > hhmm(now)) return 'upcoming';
    return 'toGrade';
  }
  function daysUntil(date, now = new Date()) {
    const a = new Date(iso(now) + 'T12:00:00'), b = new Date(date + 'T12:00:00');
    return Math.round((b - a) / 864e5);
  }
  /* Form values → a clean record, or {error} with a message for the student. */
  function normalize(values, previous = {}, now = new Date()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date || '')) return {error:'Choisis la date de l’épreuve.'};
    if (!values.subjectId) return {error:'Choisis une matière.'};
    const time = /^\d{2}:\d{2}$/.test(values.time || '') ? values.time : '';
    const record = {
      ...previous,
      kind: kinds.some(([k]) => k === values.kind) ? values.kind : 'colle',
      subjectId: String(values.subjectId),
      chapterIds: [...new Set((values.chapterIds || []).map(String).filter(Boolean))],
      date: values.date, time
    };
    delete record.chapterId;
    if (status({...record, score: null}, now) === 'upcoming') return {...record, score: null, classAverage: null, outOf: number(previous.outOf) || 20, note: previous.note || ''};
    const outOf = number(values.outOf) ?? 20, score = number(values.score), average = number(values.classAverage);
    if (!(outOf > 0 && outOf <= 100)) return {error:'Le barème doit être compris entre 1 et 100.'};
    if (score !== null && (score < 0 || score > outOf)) return {error:`La note doit être comprise entre 0 et ${outOf}.`};
    if (average !== null && (average < 0 || average > outOf)) return {error:`La moyenne de la classe doit être comprise entre 0 et ${outOf}.`};
    return {
      ...record,
      score: score === null ? null : round(score, 2),
      outOf: round(outOf, 2),
      classAverage: average === null ? null : round(average, 2),
      note: String(values.note || '').trim().slice(0, NOTE_MAX)
    };
  }
  function mean(grades) { return grades.length ? grades.reduce((n, g) => n + on20(g), 0) / grades.length : null; }
  function sorted(grades) { return grades.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))); }
  const graded = state => sorted(list(state).filter(isGraded));
  /* Change between the average of the last three grades and the three before them. */
  function trend(grades) {
    const s = sorted(grades.filter(isGraded));
    if (s.length < 4) return null;
    return round(mean(s.slice(-3)) - mean(s.slice(-6, -3)));
  }
  function bySubject(state) {
    const all = graded(state);
    return (state.subjects || []).map(subject => {
      const own = all.filter(g => g.subjectId === subject.id);
      const compared = own.filter(g => typeof g.classAverage === 'number');
      return {
        subject, grades: own, count: own.length,
        average: own.length ? round(mean(own)) : null,
        trend: trend(own),
        gap: compared.length ? round(compared.reduce((n, g) => n + (g.score - g.classAverage) / g.outOf * 20, 0) / compared.length) : null,
        points: own.slice(-10).map(on20)
      };
    }).filter(row => row.count);
  }
  /* What colles and DS say about one chapter: its latest grade and the next exam covering it. */
  function chapterStatus(state, chapterId, now = new Date()) {
    const covering = list(state).filter(g => chapterIdsOf(g).includes(chapterId));
    const last = sorted(covering.filter(isGraded)).pop() || null;
    const next = sorted(covering.filter(g => status(g, now) === 'upcoming'))[0] || null;
    return {last, next, weak: !!last && on20(last) < WEAK};
  }
  /* Chapters whose latest grade is under 10/20: a better grade since then means it was fixed. */
  function weakChapters(state) {
    const out = [];
    (state.subjects || []).forEach(subject => (subject.chapters || []).forEach(chapter => {
      const {last, weak} = chapterStatus(state, chapter.id);
      if (weak) out.push({subject, chapter, last});
    }));
    return out.sort((a, b) => on20(a.last) - on20(b.last));
  }
  /* Preparation of an exam from the Matières steps of the chapters it covers. */
  function preparation(state, g, steps) {
    const subject = (state.subjects || []).find(s => s.id === g.subjectId);
    const chapters = chapterIdsOf(g).map(id => subject?.chapters?.find(c => c.id === id)).filter(Boolean).map(chapter => {
      const units = steps.filter(step => chapter.steps?.[step.key]).length + (chapter.done ? 1 : 0);
      const next = steps.find(step => !chapter.steps?.[step.key]) || null;
      return {chapter, units, next, ready: !!chapter.done};
    });
    const percent = chapters.length ? Math.round(chapters.reduce((n, c) => n + c.units, 0) / (chapters.length * STEPS) * 100) : null;
    return {subject, chapters, percent, ready: chapters.filter(c => c.ready).length, todo: chapters.find(c => !c.ready) || null};
  }
  function summary(state) {
    const all = graded(state);
    return {count: all.length, average: all.length ? round(mean(all)) : null, trend: trend(all)};
  }
  /* The exam lives in the calendar as an all-day or timed "Examens" event. */
  function upsertEvent(state, g, title, makeId) {
    state.events ||= [];
    const values = {title, date: g.date, endDate: g.date, time: g.time || '', end: '', allDay: !g.time, category: 'exam', gradeId: g.id};
    const existing = state.events.find(e => e.id === g.eventId) || state.events.find(e => e.gradeId === g.id);
    if (existing) {Object.assign(existing, values); g.eventId = existing.id;}
    else {g.eventId = makeId(); state.events.push({id: g.eventId, ...values});}
  }
  function removeEvent(state, g) {
    state.events = (state.events || []).filter(e => e.id !== g.eventId && e.gradeId !== g.id);
  }
  /* A move made in the calendar wins; a deleted calendar event only unlinks the exam. */
  function syncFromEvents(state) {
    let changed = false;
    list(state).forEach(g => {
      if (!g.eventId) return;
      const e = (state.events || []).find(x => x.id === g.eventId);
      if (!e) {g.eventId = ''; changed = true; return;}
      if (e.date && (e.date !== g.date || (e.time || '') !== (g.time || ''))) {g.date = e.date; g.time = e.time || ''; changed = true;}
    });
    return changed;
  }
  root.PrepagoGradesCore = {kinds, kindLabel, LIMIT, NOTE_MAX, WEAK, STEPS, number, on20, round, iso, isGraded, chapterIdsOf, list, status, daysUntil, normalize, mean, sorted, graded, trend, bySubject, chapterStatus, weakChapters, preparation, summary, upsertEvent, removeEvent, syncFromEvents};
  if (typeof module !== 'undefined') module.exports = root.PrepagoGradesCore;
})(typeof window !== 'undefined' ? window : globalThis);
