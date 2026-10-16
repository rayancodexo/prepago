/* Phone presentation only; reuse the existing workspace data and actions. */
(() => {
  'use strict';
  const phone = window.matchMedia('(max-width: 767px)');
  const header = document.querySelector('.topbar');
  const search = document.querySelector('#topSearch');
  const searchResults = document.querySelector('#topSearchResults');
  const searchToggle = document.createElement('button');
  searchToggle.type = 'button';
  searchToggle.className = 'mobile-search-toggle';
  searchToggle.setAttribute('aria-label', 'Ouvrir la recherche');
  searchToggle.setAttribute('aria-controls', 'topSearch');
  searchToggle.setAttribute('aria-expanded', 'false');
  searchToggle.innerHTML = '<img src="icons/search.svg" alt="" aria-hidden="true">';
  document.querySelector('.topbar-actions').prepend(searchToggle);
  document.querySelector('#topbarCreate').setAttribute('aria-label', 'Créer un élément');

  function closeSearch(returnFocus = false) {
    header.classList.remove('mobile-search-open');
    searchToggle.setAttribute('aria-expanded', 'false');
    searchToggle.setAttribute('aria-label', 'Ouvrir la recherche');
    searchResults.hidden = true;
    if (returnFocus) searchToggle.focus();
  }
  searchToggle.addEventListener('click', () => {
    if (header.classList.contains('mobile-search-open')) { closeSearch(true); return; }
    header.classList.add('mobile-search-open');
    searchToggle.setAttribute('aria-expanded', 'true');
    searchToggle.setAttribute('aria-label', 'Fermer la recherche');
    search.focus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && header.classList.contains('mobile-search-open')) closeSearch(true);
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.topbar')) closeSearch();
    if (event.target.closest('[data-go], [data-search-subject], [data-search-chapter]')) closeSearch();
  });

  function decoratePhoneGreeting() {
    if (!phone.matches || currentPage !== 'overview') return;
    const title = document.querySelector('.dashboard-heading h1');
    if (!title || title.querySelector('span')) return;
    const name = title.textContent.replace(/^Bonjour,?\s*/, '').trim();
    title.innerHTML = name ? `Bonjour,<span>${esc(name)}.</span>` : 'Bonjour.';
  }
  const previousSidebarUpdate = updateSidebar;
  updateSidebar = function (...args) {
    const result = previousSidebarUpdate(...args);
    decoratePhoneGreeting();
    return result;
  };
  function decoratePhoneDashboard() {
    if (!phone.matches || currentPage !== 'overview') return;
    const heading = document.querySelector('.dashboard-heading');
    const metrics = document.querySelector('.dashboard-metrics');
    if (!heading || !metrics) return;
    decoratePhoneGreeting();
    ['Tâches aujourd’hui', 'Cette semaine', 'Aujourd’hui', 'Progression'].forEach((label, index) => {
      metrics.children[index].querySelector('small').textContent = label;
    });
    const todayTasks = state.tasks.filter(task => task.date === todayISO());
    metrics.children[0].querySelector('strong').textContent = `${todayTasks.filter(task => task.done).length}/${todayTasks.length}`;
    const active = window.PrepagoFocus?.snapshot()?.active;
    metrics.insertAdjacentHTML('afterend', `<section class="mobile-focus-card" aria-labelledby="mobileFocusTitle"><span class="mobile-focus-kicker">CONCENTRATION</span><h2 id="mobileFocusTitle">Un chapitre à la fois.</h2><p>${active ? 'Retrouve ton chrono et ton objectif.' : 'Reprends là où tu t’es arrêté.'}</p><button class="primary-btn mobile-focus-start" data-go="focus">${uiIcon('play')}<span>${active ? 'Reprendre ma session' : 'Commencer une session'}</span></button></section>`);
    const next = nextStudy();
    const units = next ? chapterUnits(next.c) : 0;
    const percentage = Math.round(units / 5 * 100);
    document.querySelector('.mobile-focus-card').insertAdjacentHTML('afterend', `<section class="mobile-revisions" aria-labelledby="mobileRevisionsTitle"><h2 id="mobileRevisionsTitle">Mes révisions</h2>${next ? `<button class="mobile-revision-open" data-resume-subject="${esc(next.s.id)}" data-resume-chapter="${esc(next.c.id)}"><span class="mobile-revision-copy"><small>${esc(next.s.name)}</small><strong>${esc(next.c.name)}</strong></span>${uiIcon('right')}<span class="mobile-revision-progress"><span class="progress-bar" role="progressbar" aria-label="Progression de ${esc(next.c.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}"><span class="progress-fill" style="width:${percentage}%"></span></span><span>${percentage} %</span></span></button>` : `<p>${state.subjects.length ? 'Tous tes chapitres sont à jour.' : 'Ajoute une matière pour commencer tes révisions.'}</p><button class="link-btn" data-go="subjects">Voir mes matières</button>`}</section>`);
    const taskHeading = document.querySelector('.dashboard-tasks h2');
    const taskTitle = taskHeading.querySelector('.dashboard-panel-title');
    if (taskTitle) taskTitle.textContent = 'À faire aujourd’hui';
    else taskHeading.firstChild.textContent = 'À faire aujourd’hui';
  }
  const previousRender = render;
  render = function (...args) {
    const result = previousRender(...args);
    decoratePhoneDashboard();
    return result;
  };
  phone.addEventListener('change', () => { closeSearch(); render(); });
  decoratePhoneDashboard();
})();
