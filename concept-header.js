(() => {
  const search = document.querySelector('#topSearch');
  const trigger = document.querySelector('#topbarCreate');
  const menu = document.querySelector('#topbarCreateMenu');
  const notification = document.querySelector('#notificationBtn');
  const notificationPanel = document.querySelector('#notificationPanel');
  const profile = document.querySelector('#topbarProfile');
  const profileMenu = document.querySelector('#topbarProfileMenu');

  function closeMenu(returnFocus = false) {
    if (menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (returnFocus) trigger.focus();
  }
  function closeProfile(returnFocus = false) {
    if (profileMenu.hidden) return;
    profileMenu.hidden = true;
    profile.setAttribute('aria-expanded', 'false');
    if (returnFocus) profile.focus();
  }

  trigger.addEventListener('click', () => {
    const opening = menu.hidden;
    menu.hidden = !opening;
    trigger.setAttribute('aria-expanded', String(opening));
    if (opening) {
      closeProfile();
      notificationPanel.hidden = true;
      notification.setAttribute('aria-expanded', 'false');
      document.querySelector('#topSearchResults').hidden = true;
    }
  });

  trigger.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    menu.querySelector('button')?.focus();
  });

  menu.addEventListener('keydown', event => {
    const choices = [...menu.querySelectorAll('button')];
    const current = choices.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      choices[(current + (event.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length]?.focus();
    }
  });

  menu.addEventListener('click', event => {
    const choice = event.target.closest('[data-header-create]');
    if (!choice) return;
    closeMenu();
    switch (choice.dataset.headerCreate) {
      case 'task': taskEditor(); break;
      case 'event': eventEditor(); break;
      case 'subject':
        navigate('subjects');
        document.querySelector('#addSubject')?.click();
        break;
      case 'focus': navigate('focus'); break;
    }
  });

  profile.addEventListener('click', () => {
    const opening = profileMenu.hidden;
    profileMenu.hidden = !opening;
    profile.setAttribute('aria-expanded', String(opening));
    if (opening) closeMenu();
  });
  profile.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    profileMenu.hidden = false;
    profile.setAttribute('aria-expanded', 'true');
    profileMenu.querySelector('button')?.focus();
  });
  profileMenu.addEventListener('keydown', event => {
    const choices = [...profileMenu.querySelectorAll('button')];
    const current = choices.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); closeProfile(true); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      choices[(current + (event.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length]?.focus();
    }
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.topbar-create-wrap')) closeMenu();
    if (!event.target.closest('.topbar-profile-wrap')) closeProfile();
    if (!event.target.closest('#notificationBtn')) return;
    const sync = document.querySelector('.sync-indicator');
    if (!sync || !/Brouillon|Non synchronisé|Conflit/.test(sync.textContent)) return;
    const recovery = document.createElement('button');
    recovery.type = 'button';
    recovery.className = 'sync-recovery';
    recovery.textContent = /Brouillon/.test(sync.textContent) ? 'Récupérer ma sauvegarde locale' : 'Vérifier la synchronisation';
    recovery.addEventListener('click', () => sync.click());
    notificationPanel.append(recovery);
  });

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !document.body.classList.contains('auth-pending') && getComputedStyle(document.querySelector('.topbar')).display !== 'none') {
      event.preventDefault();
      closeMenu();
      search.focus();
      search.select();
    } else if (event.key === 'Escape') { closeMenu(); closeProfile(); }
  });
})();
