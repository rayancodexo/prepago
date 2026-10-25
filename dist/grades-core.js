/* Colles and DS grades, kept in the account state as state.grades. Pure helpers, no DOM. */
(function (root) {
  const kinds = [['colle','Colle'],['ds','DS'],['dm','DM'],['blanc','Concours blanc']];
  const LIMIT = 600, NOTE_MAX = 400, WEAK = 10;
  const kindLabel = key => (kinds.find(([k]) => k === key) || kinds[0])[1];
  const number = value => {
    const n = Number(String(value ?? '').replace(',', '.').trim());
    return String(value ?? '').trim() !== '' && Number.isFinite(n) ? n : null;
  };
  const round = (n, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
  const on20 = g => g.score / g.outOf * 20;
  function list(state) { return Array.isArray(state.grades) ? state.grades : []; }
  /* Form values → a clean record, or {error} with a message for the student. */
  function normalize(values, previous = {}) {
    const outOf = number(values.outOf) ?? 20, score = number(values.score), average = number(values.classAverage);
    if (!(outOf > 0 && outOf <= 100)) return {error:'Le barème doit être compris entre 1 et 100.'};
    if (score === null || score < 0 || score > outOf) return {error:`La note doit être comprise entre 0 et ${outOf}.`};
    if (average !== null && (average < 0 || average > outOf)) return {error:`La moyenne de la classe doit être comprise entre 0 et ${outOf}.`};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date || '')) return {error:'Choisis la date de l’épreuve.'};
    if (!values.subjectId) return {error:'Choisis une matière.'};
    return {
      ...previous,
      kind: kinds.some(([k]) => k === values.kind) ? values.kind : 'colle',
      subjectId: String(values.subjectId),
      chapterId: values.chapterId ? String(values.chapterId) : '',
      date: values.date,
      score: round(score, 2),
      outOf: round(outOf, 2),
      classAverage: average === null ? null : round(average, 2),
      note: String(values.note || '').trim().slice(0, NOTE_MAX)
    };
  }
  function mean(grades) { return grades.length ? grades.reduce((n, g) => n + on20(g), 0) / grades.length : null; }
  function sorted(grades) { return grades.slice().sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))); }
  /* Change between the average of the last three grades and the three before them. */
  function trend(grades) {
    const s = sorted(grades);
    if (s.length < 4) return null;
    const recent = s.slice(-3), before = s.slice(-6, -3);
    return round(mean(recent) - mean(before));
  }
  function bySubject(state) {
    const grades = list(state);
    return (state.subjects || []).map(subject => {
      const own = sorted(grades.filter(g => g.subjectId === subject.id));
      const compared = own.filter(g => g.classAverage !== null && g.classAverage !== undefined);
      return {
        subject, grades: own, count: own.length,
        average: own.length ? round(mean(own)) : null,
        trend: trend(own),
        gap: compared.length ? round(compared.reduce((n, g) => n + (g.score - g.classAverage) / g.outOf * 20, 0) / compared.length) : null,
        points: own.slice(-10).map(on20)
      };
    }).filter(row => row.count);
  }
  /* Chapters whose latest grade is under 10/20: a better grade since then means it was fixed. */
  function weakChapters(state) {
    const grades = sorted(list(state).filter(g => g.chapterId)), seen = new Map();
    grades.forEach(g => { const row = seen.get(g.chapterId) || []; row.push(g); seen.set(g.chapterId, row); });
    const out = [];
    seen.forEach((rows, chapterId) => {
      const subject = (state.subjects || []).find(s => s.id === rows[0].subjectId);
      const chapter = subject?.chapters?.find(c => c.id === chapterId);
      if (!chapter) return;
      const last = rows[rows.length - 1], avg = mean(rows);
      if (on20(last) < WEAK) out.push({subject, chapter, last, average: round(avg), count: rows.length});
    });
    return out.sort((a, b) => a.average - b.average);
  }
  function summary(state) {
    const grades = list(state);
    return {count: grades.length, average: grades.length ? round(mean(grades)) : null, trend: trend(grades)};
  }
  root.PrepagoGradesCore = {kinds, kindLabel, LIMIT, NOTE_MAX, WEAK, number, on20, round, list, normalize, mean, sorted, trend, bySubject, weakChapters, summary};
  if (typeof module !== 'undefined') module.exports = root.PrepagoGradesCore;
})(typeof window !== 'undefined' ? window : globalThis);
