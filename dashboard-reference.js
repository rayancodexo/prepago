/* Dashboard shell presentation. Account, support and AI actions stay on their existing handlers. */
(() => {
  'use strict';
  function decorateShell() {
    const footer = document.querySelector('.sidebar-footer');
    if (footer && !footer.querySelector('.dashboard-help')) {
      footer.insertAdjacentHTML('afterbegin', '<button type="button" class="dashboard-help" data-support-open><img class="icon-svg" src="icons/circle-help.svg" alt="" aria-hidden="true"><span>Aide</span></button>');
    }
    const profile = document.querySelector('.sidebar-profile');
    if (profile && !profile.querySelector('.dashboard-account-label')) {
      profile.insertAdjacentHTML('afterbegin', '<span class="dashboard-account-icon"><img class="icon-svg" src="icons/user-round.svg" alt="" aria-hidden="true"></span><span class="dashboard-account-label">Mon compte</span>');
      profile.setAttribute('aria-label', 'Menu du compte');
    }
    document.querySelectorAll('.studio-profile-menu, #topbarProfileMenu').forEach(menu => {
      if (!menu.querySelector('[data-go="ai"]')) {
        menu.insertAdjacentHTML('beforeend', '<button type="button" role="menuitem" data-go="ai">Prepago AI+ · abonnement requis</button>');
      }
    });
    const plus = document.querySelector('.topbar-create-plus');
    if (plus && !plus.querySelector('img')) plus.innerHTML = '<img class="icon-svg" src="icons/plus.svg" alt="" aria-hidden="true">';
    [['projects', 'flask-conical'], ['focus', 'circle-dot']].forEach(([page, icon]) => {
      const slot = document.querySelector(`#mainNav [data-page="${page}"] .icon`);
      if (slot) slot.innerHTML = `<img class="icon-svg" src="icons/${icon}.svg" alt="" aria-hidden="true">`;
    });
  }
  const previousRender = render;
  render = function (...args) {
    const result = previousRender(...args);
    decorateShell();
    return result;
  };
  decorateShell();
})();
