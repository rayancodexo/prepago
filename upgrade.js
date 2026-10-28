/* Upgrade screen shown when a plan limit is reached (see plans-config.js). Not an error. */
(() => {
  const perks = [
    'Colles illimitées, seul ou à deux',
    'Mode duo sur deux téléphones avec un code',
    'Mes épreuves : courbes par matière et questions à retravailler',
    'Matières, tâches, calendrier et concentration'
  ];
  function html(result, back = '') {
    return `<section class="card upgrade-card" role="region" aria-labelledby="upgradeTitle">
      <span class="upgrade-kicker">Formule ${esc(window.PrepagoPlans.NAMES[result.plan] || '')}</span>
      <h2 id="upgradeTitle">Continue avec Prepago</h2>
      <p>${esc(result.message)}</p>
      <ul>${perks.map(p => `<li>${uiIcon('check')}<span>${p}</span></li>`).join('')}</ul>
      <div class="upgrade-actions"><a class="primary-btn" href="/tarifs/">Voir les formules</a>${back ? `<button type="button" class="secondary-btn" ${back}>Retour</button>` : ''}</div>
    </section>`;
  }
  window.PrepagoUpgrade = {html};
})();
