/* Local QA stand-in for the Supabase SDK. Loaded in place of /vendor/supabase-*.js
   by tests/qa/run.py. No network, no real accounts. Never shipped: it lives outside dist/. */
(() => {
  const cfg = Object.assign({ mode: 'active', admin: false, promoOk: true, confirmEmail: true }, window.__QA || {});
  const calls = (window.__QA_CALLS = []);
  const uid = '11111111-1111-4111-8111-111111111111';
  const user = { id: uid, email: 'qa@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', user_metadata: cfg.metaCode ? { activation_code: cfg.metaCode } : {} };
  const days = n => new Date(Date.now() + n * 864e5).toISOString();
  const stamp = () => new Date().toISOString().replace('Z', '000+00:00');
  let session = cfg.mode === 'signed-out' ? null : { user, access_token: 'qa', refresh_token: 'qa' };
  const inactive = cfg.mode === 'inactive' || cfg.mode === 'signed-out-inactive';
  const profile = {
    full_name: cfg.name === undefined ? 'Yasmine El Idrissi' : cfg.name, filiere: cfg.filiere || 'MP',
    trial_started_at: null, trial_ends_at: null,
    subscription_status: inactive ? 'inactive' : 'promo',
    subscription_ends_at: inactive ? null : days(21), subscription_plan: 'standard',
  };
  let workspace = cfg.state ? { data: cfg.state, updated_at: stamp() } : null;
  let settings = { config: { work: 25, break: 5, dailyHours: 4, cycles: 1, streakMinutes: 30, sound: true, subjectId: '', chapterId: '', goal: '', notes: '' } };
  const sessions = cfg.sessions || [];
  const listeners = [];
  const ok = data => ({ data, error: null });
  const emit = event => listeners.forEach(fn => { try { fn(event, session); } catch (e) { console.error(e); } });

  function rows(name, ops) {
    const did = k => ops.some(([op]) => op === k);
    if (name === 'profiles') { if (did('update')) Object.assign(profile, ops.find(([op]) => op === 'update')[1][0]); return did('update') ? null : [profile]; }
    if (name === 'user_roles') return [{ role: cfg.admin ? 'admin' : 'student' }];
    if (name === 'student_app_state') return workspace ? [workspace] : [];
    if (name === 'study_settings') { if (did('update')) Object.assign(settings, ops.find(([op]) => op === 'update')[1][0]); return [settings]; }
    if (name === 'study_sessions') return sessions;
    if (name === 'cnc_exams') return cfg.exams || [];
    if (name === 'support_reports') return cfg.reports || [];
    if (name === 'promo_codes') return [];
    return [];
  }
  function table(name) {
    const ops = []; let shape = 'many';
    const builder = new Proxy({}, {
      get(_, key) {
        if (key === 'then') return (resolve, reject) => {
          calls.push({ table: name, ops: ops.map(([op]) => op), shape });
          const list = rows(name, ops);
          const data = shape === 'many' ? list : (list && list[0]) || null;
          const error = shape === 'single' && !data && list !== null ? { code: 'PGRST116', message: 'no rows' } : null;
          return Promise.resolve({ data, error }).then(resolve, reject);
        };
        if (key === 'single' || key === 'maybeSingle') return () => { shape = key; return builder; };
        return (...args) => { ops.push([key, args]); return builder; };
      },
    });
    return builder;
  }
  const monday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
  const iso = d => d.toISOString().slice(0, 10);
  const rpc = {
    save_student_state: a => { workspace = { data: a.next_data, updated_at: stamp() }; return [{ saved: true, server_updated_at: workspace.updated_at }]; },
    redeem_promo_code: a => {
      window.__QA_REDEEMED = a.input_code;
      if (!cfg.promoOk) return [{ success: false, message: 'Ce code promo est invalide.', access_ends_at: null }];
      Object.assign(profile, { subscription_status: 'promo', subscription_ends_at: days(30) });
      return [{ success: true, message: 'Code activé. Ton accès est débloqué.', access_ends_at: profile.subscription_ends_at }];
    },
    study_bootstrap: () => ({ server_now: new Date().toISOString() }),
    study_action: a => ({ session: null, server_now: new Date().toISOString(), qa: a.p_action }),
    weekly_xp_leaderboard: () => ({
      week_start: iso(monday), week_end: iso(new Date(monday.getTime() + 6 * 864e5)), ends_at: new Date(monday.getTime() + 7 * 864e5).toISOString(),
      timezone: 'Africa/Casablanca', updated_at: new Date().toISOString(), participants: 4,
      top10: [
        { position: 1, display_name: 'Salma B.', filiere: 'PSI', xp: 640, is_self: false },
        { position: 2, display_name: 'Yasmine E.', filiere: 'MP', xp: 515, is_self: true },
        { position: 3, display_name: 'Mehdi A.', filiere: 'MP', xp: 420, is_self: false },
        { position: 4, display_name: 'Ilyas T.', filiere: 'TSI', xp: 180, is_self: false },
      ],
      self: { position: 2, xp: 515, participating: true, is_admin: !!cfg.admin },
    }),
    set_weekly_xp_participation: () => rpc.weekly_xp_leaderboard(),
    record_workspace_fault: () => true,
    submit_support_report: () => uid,
    admin_dashboard: () => ({ accounts: [], activity: [] }),
  };
  const client = {
    auth: {
      getSession: async () => ok({ session }),
      onAuthStateChange(fn) { listeners.push(fn); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithPassword(v) { calls.push({ auth: 'signIn', email: v.email }); if (cfg.badLogin) return { data: { session: null }, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } }; session = { user, access_token: 'qa', refresh_token: 'qa' }; setTimeout(() => emit('SIGNED_IN')); return ok({ session, user }); },
      async signUp(v) { calls.push({ auth: 'signUp', email: v.email, data: v.options && v.options.data, redirect: v.options && v.options.emailRedirectTo }); if (cfg.confirmEmail) return ok({ user, session: null }); session = { user, access_token: 'qa', refresh_token: 'qa' }; setTimeout(() => emit('SIGNED_IN')); return ok({ user, session }); },
      async signOut() { session = null; setTimeout(() => emit('SIGNED_OUT')); return { error: null }; },
      async verifyOtp() { return ok({ session }); },
      async exchangeCodeForSession() { return ok({ session }); },
      async setSession() { return ok({ session }); },
      async resend() { return { data: {}, error: null }; },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
      async updateUser(v) { calls.push({ auth: 'updateUser', data: v && v.data }); if (v && v.data) Object.assign(user.user_metadata, v.data); return ok({ user }); },
    },
    from: table,
    async rpc(name, args) { calls.push({ rpc: name, args }); return rpc[name] ? ok(rpc[name](args || {})) : { data: null, error: { code: 'QA_UNSTUBBED', message: 'unstubbed rpc ' + name } }; },
    storage: { from: () => ({ async createSignedUrl() { return ok({ signedUrl: 'about:blank' }); }, async upload() { return ok({}); } }) },
    functions: { async invoke(name, o) { calls.push({ fn: name }); return ok({ allowed: false, enabled: false, used_today: 0, daily_limit: 10, mode: 'text' }); } },
  };
  window.supabase = { createClient: () => client };
})();
