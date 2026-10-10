(() => {
  const legacyPages = { '#tarifs': '/tarifs/', '#methode': '/methode/' };
  if (legacyPages[location.hash]) { location.replace(legacyPages[location.hash]); return; }
  const landing = document.getElementById('prepagoLanding');
  landing.addEventListener('click', event => {
    const link = event.target.closest('[data-enter]');
    if (!link) return;
    document.body.classList.remove('landing-view');
    document.querySelector('[data-auth-mode="' + link.dataset.enter + '"]')?.click();
    window.scrollTo(0, 0);
    setTimeout(() => document.querySelector('#authForm input[name="email"]')?.focus(), 100);
  });
  window.addEventListener('hashchange', () => {
    if (legacyPages[location.hash]) { location.assign(legacyPages[location.hash]); return; }
    const mode = location.hash === '#inscription' ? 'signup' : location.hash === '#connexion' ? 'login' : null;
    if (mode) document.querySelector('[data-auth-mode="' + mode + '"]')?.click();
    if (['#connexion', '#inscription', '#dashboard'].includes(location.hash)) document.body.classList.remove('landing-view');
    else if (!/(access_token|refresh_token|type=recovery|recovery=1|auth=forgot|error=|code=|token_hash=)/.test(location.hash + location.search)) document.body.classList.add('landing-view');
  });
})();

/* Product tour on the home page: the video loads only when it is on screen, plays muted in a
   loop, pauses when scrolled away, and never starts by itself when the visitor asked for
   reduced motion or data saving. One button pauses or plays it. */
(() => {
  const box = document.querySelector('[data-tour-box]');
  if (!box || !('IntersectionObserver' in window)) return;
  const toggle = box.querySelector('[data-tour-toggle]');
  const label = toggle && toggle.querySelector('span');
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  let wanted = !(reduce || saveData);
  let inView = false;

  const shown = v => v.offsetParent !== null && v.getClientRects().length > 0;
  const current = () => [...box.querySelectorAll('video[data-tour]')].find(shown);
  const pick = v => {
    // H.264 everywhere it plays; VP9 WebM for the few browsers without it.
    const mp4 = v.canPlayType('video/mp4; codecs="avc1.640028"') !== '';
    const big = window.innerWidth * (window.devicePixelRatio || 1) > 1700;
    const d = v.dataset;
    if (mp4) return big && d.srcLarge ? d.srcLarge : d.src;
    return big && d.webmLarge ? d.webmLarge : d.webm || d.src;
  };
  const setLabel = () => {
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', String(!wanted));
    label.textContent = wanted ? 'Mettre en pause' : 'Lire la visite';
  };
  const sync = () => {
    box.querySelectorAll('video[data-tour]').forEach(v => { if (v !== current() && !v.paused) v.pause(); });
    const v = current();
    if (!v) return;
    if (wanted && inView) {
      if (!v.getAttribute('src')) { v.src = pick(v); v.load(); }
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    } else if (!v.paused) v.pause();
  };

  box.querySelectorAll('video[data-tour]').forEach(v => {
    v.addEventListener('playing', () => box.classList.add('is-playing'));
    v.addEventListener('loadeddata', () => box.classList.add('has-frame'));
  });
  if (toggle) toggle.addEventListener('click', () => { wanted = !wanted; setLabel(); sync(); });
  setLabel();

  new IntersectionObserver(entries => { inView = entries.some(e => e.isIntersecting); sync(); }, { threshold: .35 }).observe(box);
  addEventListener('resize', () => { clearTimeout(sync.t); sync.t = setTimeout(sync, 200); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { const v = current(); if (v) v.pause(); } else sync(); });
})();
