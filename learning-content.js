/* Complementary publisher links, matched to the chapter and school year. */
(function (root) {
  'use strict';
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/s\b/g, '').trim();
  const hosts = new Set(['exo7.emath.fr', 'uel.unisciel.fr', 'docs.python.org']);

  function safeUrl(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && hosts.has(url.hostname) && !url.username && !url.password; }
    catch { return false; }
  }

  function resources(subject, chapter, catalogue) {
    const title = normalize(chapter?.name);
    if (!title || !['sup', 'spe'].includes(chapter?.studyLevel)) return [];
    return (catalogue?.items || []).filter(item => item.subject === subject?.curriculumKey
      && item.levels.includes(chapter.studyLevel) && safeUrl(item.url))
      .map(item => ({item, score: Math.max(0, ...item.tags.filter(tag => title.includes(normalize(tag))).map(tag => normalize(tag).length))}))
      .filter(entry => entry.score > 0).sort((a, b) => b.score - a.score)
      .slice(0, 4).map(entry => entry.item);
  }

  function markup(subject, chapter) {
    const items = resources(subject, chapter, root.PrepagoLearningResources);
    if (!items.length) return '';
    const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    return `<details class="chapter-resources"><summary>Ressources complémentaires <span>${items.length}</span></summary>
      <ul>${items.map(item => `<li><a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer"><strong>${escape(item.label)}</strong><span>${escape(item.kind)} · ${escape(item.source)} ↗</span></a></li>`).join('')}</ul>
      <p>À compléter avec ton cours et le programme marocain. Ces liens ouvrent le site de l’auteur.</p></details>`;
  }
  const api = Object.freeze({resources, markup});
  root.PrepagoLearningContent = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'object' ? window : globalThis);
