/* Prépa picker: a searchable list of Moroccan public CPGE centres, plus a
 * "Ma prépa n'est pas dans la liste" option that lets the student type the name.
 * The chosen name is written to a hidden input named "prepa" (max 120 characters).
 * Sources for the list: public CPGE centres published by cpge.ac.ma result pages and
 * etudiant.ma (2018/2019 list), plus the public/private partnership centres.
 */
(function () {
  'use strict';

  const MAX = 120;
  const CENTRES = [
    'Lycée Reda Slaoui — Agadir',
    'Lycée Mohammed V — Béni Mellal',
    'Lycée d’excellence — Ben Guerir',
    'Lycée Al Khansaa — Casablanca',
    'Lycée Mohammed V — Casablanca',
    'École Royale Navale — Casablanca',
    'Centre Okba Ibn Nafea — Dakhla',
    'Lycée Errazi — El Jadida',
    'Lycée Ibn Tahir — Errachidia',
    'Centre CPGE Moulay Idriss — Fès',
    'Lycée Bab Essahra — Guelmim',
    'Lycée Mohammed VI — Kénitra',
    'Lycée Ibn Abdoun — Khouribga',
    'Lycée Lissane Eddine Ibn Al Khatib — Laâyoune',
    'Lycée Ibn Timiya — Marrakech',
    'École Royale de l’Air — Marrakech',
    'Lycée Méditerranéen (LYMED) — Martil',
    'Lycée Omar Ibn Al Khattab — Meknès',
    'Lycée Moulay Ismail — Meknès',
    'Lycée Technique — Mohammedia',
    'Lycée Abdelkrim Al Khattabi — Nador',
    'Lycée Omar Ibn Abdelaziz — Oujda',
    'Lycée Omar Al Khayyam — Rabat',
    'Lycée Moulay Youssef — Rabat',
    'Lycée Al Zahrawi — Rabat',
    'Lycée Moulay Abdellah — Safi',
    'Lycée Salmane Al Farissi — Salé',
    'Lycée Technique — Settat',
    'Lycée Moulay El Hassan — Tanger',
    'Lycée Acharif Al Idrissi — Taza',
    'Centre CPGE — Tétouan'
  ];
  const OTHER = '__other__';

  const fold = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[’'`-]/g, ' ').replace(/\s+/g, ' ').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX);
  }

  function matches(query) {
    const words = fold(query).split(' ').filter(Boolean);
    if (!words.length) return CENTRES.slice();
    return CENTRES.filter(name => { const f = fold(name); return words.every(w => f.includes(w)); });
  }

  let uid = 0;
  function mount(root, options = {}) {
    if (!root || root.dataset.prepaMounted) return root?.__prepa;
    const id = 'prepa' + (++uid);
    const initial = clean(options.value);
    const inList = CENTRES.includes(initial);
    root.dataset.prepaMounted = '1';
    root.classList.add('prepa-picker');
    root.innerHTML = `
      <span class="prepa-label" id="${id}Label">${esc(options.label || 'Ta prépa')}</span>
      <input type="hidden" name="prepa" value="${esc(initial)}">
      <div class="prepa-chosen" ${initial ? '' : 'hidden'}><span class="prepa-chosen-name"></span><button type="button" class="prepa-change">Changer</button></div>
      <div class="prepa-search" ${initial ? 'hidden' : ''}>
        <input type="search" class="prepa-query" id="${id}Query" placeholder="Cherche ta prépa ou ta ville" autocomplete="off" aria-labelledby="${id}Label" aria-controls="${id}List" maxlength="60">
        <ul class="prepa-list" id="${id}List" role="listbox" aria-labelledby="${id}Label"></ul>
      </div>
      <div class="prepa-other" hidden>
        <input type="text" class="prepa-other-input" placeholder="Nom de ta prépa et ville" maxlength="${MAX}" aria-label="Nom de ta prépa" value="${initial && !inList ? esc(initial) : ''}">
        <button type="button" class="prepa-back">Revenir à la liste</button>
      </div>
      <p class="prepa-error" role="alert" hidden>Choisis ta prépa dans la liste ou écris son nom.</p>`;

    const hidden = root.querySelector('input[name="prepa"]');
    const chosen = root.querySelector('.prepa-chosen');
    const search = root.querySelector('.prepa-search');
    const query = root.querySelector('.prepa-query');
    const list = root.querySelector('.prepa-list');
    const other = root.querySelector('.prepa-other');
    const otherInput = root.querySelector('.prepa-other-input');
    const error = root.querySelector('.prepa-error');
    let required = Boolean(options.required);

    function paint() {
      const found = matches(query.value);
      list.innerHTML = found.map(name => `<li><button type="button" role="option" data-prepa-pick="${esc(name)}">${esc(name)}</button></li>`).join('')
        + (found.length ? '' : '<li class="prepa-empty">Aucune prépa trouvée.</li>')
        + `<li><button type="button" role="option" class="prepa-not-listed" data-prepa-pick="${OTHER}">Ma prépa n’est pas dans la liste</button></li>`;
    }

    function showChosen(name) {
      hidden.value = name;
      chosen.querySelector('.prepa-chosen-name').textContent = name;
      chosen.hidden = false; search.hidden = true; other.hidden = true; error.hidden = true;
    }

    function showSearch() {
      hidden.value = ''; chosen.hidden = true; other.hidden = true; search.hidden = false;
      query.value = ''; paint(); query.focus();
    }

    function showOther() {
      chosen.hidden = true; search.hidden = true; other.hidden = false; error.hidden = true;
      hidden.value = clean(otherInput.value); otherInput.focus();
    }

    root.addEventListener('click', event => {
      const pick = event.target.closest('[data-prepa-pick]');
      if (pick) { pick.dataset.prepaPick === OTHER ? showOther() : showChosen(pick.dataset.prepaPick); return; }
      if (event.target.closest('.prepa-change, .prepa-back')) showSearch();
    });
    query.addEventListener('input', paint);
    query.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const first = matches(query.value)[0];
      if (first && query.value.trim()) showChosen(first);
    });
    otherInput.addEventListener('input', () => { hidden.value = clean(otherInput.value); if (hidden.value) error.hidden = true; });

    paint();
    if (initial) showChosen(initial);

    const api = {
      get value() { return clean(hidden.value); },
      set required(value) { required = Boolean(value); if (!required) error.hidden = true; },
      get required() { return required; },
      // Returns false and shows a message when a value is required but missing.
      validate() {
        const ok = !required || Boolean(clean(hidden.value));
        error.hidden = ok;
        if (!ok) (other.hidden ? query : otherInput).focus();
        return ok;
      }
    };
    root.__prepa = api;
    return api;
  }

  function mountAll() {
    document.querySelectorAll('[data-prepa-picker]').forEach(root => mount(root, {
      required: root.dataset.prepaRequired === 'true', label: root.dataset.prepaLabel
    }));
  }

  window.PrepagoPrepa = Object.freeze({centres: CENTRES.slice(), clean, matches, mount, mountAll, MAX});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
  else mountAll();
})();
