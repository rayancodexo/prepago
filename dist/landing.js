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