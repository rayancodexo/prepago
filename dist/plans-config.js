/* Plans and limits for Colle and Épreuve. Change the numbers here: this is the only place.
   Plans: free, organizer (subscription_plan 'standard') and ai_plus. While FREE_TIER_OPEN is
   false, every student who reaches the workspace (trial, promo or active access) uses the
   organizer limits: nobody is on the free plan yet. */
(function (root) {
  const FREE_TIER_OPEN = false;
  const LIMITS = {
    free: {
      colleSoloPerWeek: 3,   // solo colles per week (Monday to Sunday)
      colleDuo: false,       // duo mode on two phones
      examTimer: true,       // Mode Épreuve with timer
      examHistory: false     // "Mes épreuves" chart and statistics
    },
    organizer: {colleSoloPerWeek: Infinity, colleDuo: true, examTimer: true, examHistory: true},
    ai_plus: {colleSoloPerWeek: Infinity, colleDuo: true, examTimer: true, examHistory: true}
  };
  const NAMES = {free: 'Gratuit', organizer: 'Prepago', ai_plus: 'Prepago AI+'};
  let override = null;

  function hasAccess(profile) {
    if (!profile) return false;
    const now = Date.now(), ends = v => v ? new Date(v).getTime() : 0;
    if (profile.subscription_status === 'active') return !profile.subscription_ends_at || ends(profile.subscription_ends_at) > now;
    if (profile.subscription_status === 'promo') return ends(profile.subscription_ends_at) > now;
    if (profile.subscription_status === 'trial') return ends(profile.trial_ends_at) > now;
    return false;
  }
  function planOf(profile) {
    if (override) return override;
    if (profile?.subscription_plan === 'ai_plus' && hasAccess(profile)) return 'ai_plus';
    if (!FREE_TIER_OPEN || hasAccess(profile)) return 'organizer';
    return 'free';
  }
  const limitsOf = profile => LIMITS[planOf(profile)];
  /* {ok:true} or {ok:false, feature, plan, message} for the upgrade screen. usage.collesThisWeek
     is the number of solo colles already done this week. */
  function check(feature, profile, usage = {}) {
    const plan = planOf(profile), limits = LIMITS[plan];
    if (feature === 'colleSolo' && (usage.collesThisWeek || 0) >= limits.colleSoloPerWeek)
      return {ok: false, feature, plan, message: `Ta formule comprend ${limits.colleSoloPerWeek} colles par semaine. Tu les as toutes faites cette semaine.`};
    if (feature === 'colleDuo' && !limits.colleDuo)
      return {ok: false, feature, plan, message: 'Le mode duo, pour passer une colle à deux sur deux téléphones, est inclus dans la formule Prepago.'};
    if (feature === 'examHistory' && !limits.examHistory)
      return {ok: false, feature, plan, message: 'Les courbes et statistiques de Mes épreuves sont incluses dans la formule Prepago.'};
    if (feature === 'examTimer' && !limits.examTimer)
      return {ok: false, feature, plan, message: 'Le Mode Épreuve est inclus dans la formule Prepago.'};
    return {ok: true, feature, plan};
  }
  root.PrepagoPlans = {
    FREE_TIER_OPEN, LIMITS, NAMES, hasAccess, planOf, limitsOf, check,
    /* For tests and previews only: force a plan in this tab. */
    setOverride(plan) { override = LIMITS[plan] ? plan : null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
