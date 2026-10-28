/* Local QA stand-in for the Supabase SDK. Loaded in place of /vendor/supabase-*.js
   by tests/qa/run.py. No network, no real accounts. Never shipped: it lives outside dist/. */
(() => {
  const cfg = Object.assign({ mode: 'active', admin: false, promoOk: true, confirmEmail: true }, window.__QA || {});
  const calls = (window.__QA_CALLS = []);
  const uid = cfg.uid || '11111111-1111-4111-8111-111111111111';
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
  /* Colle and Épreuve tables: a tiny in-memory database kept in localStorage, so two pages of
     one browser context (two phones in a duo colle) share it. Row rules mirror the migration. */
  const DB_KEY = '__qa_db', DB_TABLES = ['colle_questions', 'colle_attempts', 'colle_sessions', 'exam_baremes', 'exam_attempts'];
  const newId = () => crypto.randomUUID();
  function db() {
    let d = null; try { d = JSON.parse(localStorage.getItem(DB_KEY) || 'null'); } catch (e) {}
    if (!d) { d = { colle_questions: cfg.colleQuestions || [], colle_attempts: cfg.colleAttempts || [], colle_sessions: [], exam_baremes: cfg.baremes || [], exam_attempts: cfg.examAttempts || [] }; save(d); }
    return d;
  }
  function save(d) { localStorage.setItem(DB_KEY, JSON.stringify(d)); }
  const colleScore = (qid, checked, d) => {
    const q = d.colle_questions.find(x => x.id === qid); if (!q) return 0;
    const total = q.checklist.reduce((n, i) => n + i.points, 0), got = q.checklist.reduce((n, i, k) => n + (checked.includes(k) ? i.points : 0), 0);
    return total ? Math.round(got / total * 2000) / 100 : 0;
  };
  const visible = (name, r) => ({
    colle_questions: r.status === 'approved' || r.author_user_id === uid || cfg.admin,
    colle_attempts: r.user_id === uid,
    colle_sessions: r.host_id === uid || r.guest_id === uid,
    exam_baremes: r.status === 'approved' || r.author_user_id === uid || cfg.admin,
    exam_attempts: r.user_id === uid,
  })[name];
  function dbRows(name, ops) {
    const d = db(), op = k => ops.find(([o]) => o === k), now = new Date().toISOString();
    const match = r => ops.every(([o, a]) => o === 'eq' ? r[a[0]] === a[1] : o === 'in' ? a[1].includes(r[a[0]]) : true);
    let out;
    if (op('insert')) {
      const input = [].concat(op('insert')[1][0]);
      out = input.map(v => {
        const row = { id: newId(), created_at: now, ...v };
        if (name === 'colle_questions') Object.assign(row, { status: 'pending', author_user_id: uid });
        if (name === 'exam_baremes') Object.assign(row, { status: 'pending', author_user_id: uid });
        if (name === 'colle_attempts') Object.assign(row, { user_id: uid, grading_method: 'self', ai_feedback: null, score: colleScore(row.question_id, row.checked_items || [], d) });
        if (name === 'exam_attempts') {
          const max = (row.scores || []).reduce((n, x) => n + x.max_points, 0), got = (row.scores || []).reduce((n, x) => n + x.points, 0);
          Object.assign(row, { user_id: uid, grading_method: 'self', ai_feedback: null, copy_photos: null, total_20: max ? Math.round(got / max * 2000) / 100 : null });
        }
        d[name].push(row); return row;
      });
    } else if (op('update')) {
      const values = op('update')[1][0];
      out = d[name].filter(r => visible(name, r) && match(r)).filter(r => ({ colle_questions: cfg.admin, exam_baremes: cfg.admin, colle_sessions: r.host_id === uid && !r.closed, exam_attempts: r.user_id === uid })[name]);
      out.forEach(r => {
        if (name === 'colle_sessions' && values.phase && values.phase !== r.phase) { r.phase_started_at = now; if (values.phase === 'cancelled') r.closed = true; }
        if (name === 'exam_baremes' && values.status === 'approved') d.exam_baremes.forEach(b => { if (b.paper_id === r.paper_id && b.status === 'approved' && b.id !== r.id) b.status = 'rejected'; });
        Object.assign(r, values);
      });
    } else {
      out = d[name].filter(r => visible(name, r) && match(r));
      const order = op('order'); if (order) { const [col, o] = order[1]; out.sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (o && o.ascending === false ? -1 : 1)); }
      if (name === 'colle_attempts' && String((op('select') || [, ['']])[1][0]).includes('colle_questions(')) out = out.map(r => ({ ...r, colle_questions: d.colle_questions.find(q => q.id === r.question_id) || null }));
      const limit = op('limit'); if (limit) out = out.slice(0, limit[1][0]);
    }
    save(d);
    return JSON.parse(JSON.stringify(out));
  }
  const sessionJson = s => ({ ...s, server_now: new Date().toISOString(), role: s.host_id === uid ? 'colleur' : 'etudiant' });
  const fail = message => { throw { code: 'P0001', message }; };
  const colleRpc = {
    colle_contribution: () => { const mine = db().colle_questions.filter(q => q.author_user_id === uid); const n = st => mine.filter(q => q.status === st).length; return { approved: n('approved'), pending: n('pending'), rejected: n('rejected'), goal: 5, rewarded_at: n('approved') >= 5 ? new Date().toISOString() : null }; },
    colle_session_create: a => {
      const d = db(); d.colle_sessions.forEach(x => { if (x.host_id === uid) x.closed = true; });
      const s = { id: newId(), code: cfg.duoCode || String(Math.floor(Math.random() * 10000)).padStart(4, '0'), host_id: uid, guest_id: null, question_id: a.question, prep_seconds: a.prep, pass_seconds: a.pass, phase: 'waiting', phase_started_at: null, checked_items: [], score: null, attempt_id: null, closed: false, created_at: new Date().toISOString() };
      d.colle_sessions.push(s); save(d); return sessionJson(s);
    },
    colle_session_join: a => {
      const d = db(), s = d.colle_sessions.find(x => x.code === a.join_code && !x.closed);
      if (!s) fail('Code introuvable ou expiré.');
      if (s.host_id === uid) fail('Tu es le colleur de cette colle : donne le code à ton camarade.');
      if (s.guest_id && s.guest_id !== uid) fail('Cette colle a déjà un étudiant.');
      s.guest_id = uid; if (s.phase === 'waiting') s.phase = 'ready'; save(d); return sessionJson(s);
    },
    colle_session_state: a => { const s = db().colle_sessions.find(x => x.id === a.session && (x.host_id === uid || x.guest_id === uid)); if (!s) fail('Cette colle n’existe plus.'); return sessionJson(s); },
    colle_session_finish: a => {
      const d = db(), s = d.colle_sessions.find(x => x.id === a.session && x.host_id === uid);
      if (!s || s.closed) fail('Seul le colleur peut terminer la colle : demande-lui d’envoyer ta note.');
      const score = colleScore(s.question_id, s.checked_items, d), attempt = { id: newId(), user_id: s.guest_id, question_id: s.question_id, mode: 'duo', prep_seconds: a.prep_used, pass_seconds: a.pass_used, checked_items: s.checked_items, score, grading_method: 'self', ai_feedback: null, created_at: new Date().toISOString() };
      d.colle_attempts.push(attempt); Object.assign(s, { phase: 'done', score, attempt_id: attempt.id, closed: true, phase_started_at: new Date().toISOString() }); save(d); return sessionJson(s);
    },
  };
  function table(name) {
    const ops = []; let shape = 'many';
    const builder = new Proxy({}, {
      get(_, key) {
        if (key === 'then') return (resolve, reject) => {
          calls.push({ table: name, ops: ops.map(([op]) => op), shape });
          const list = DB_TABLES.includes(name) ? dbRows(name, ops) : rows(name, ops);
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
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      if (colleRpc[name]) { try { return ok(colleRpc[name](args || {})); } catch (e) { return { data: null, error: e }; } }
      return rpc[name] ? ok(rpc[name](args || {})) : { data: null, error: { code: 'QA_UNSTUBBED', message: 'unstubbed rpc ' + name } };
    },
    storage: { from: bucket => ({ async createSignedUrl() { return ok({ signedUrl: 'about:blank' }); }, async upload(path, file) { (window.__QA_UPLOADS = window.__QA_UPLOADS || []).push({ bucket, path, type: file && file.type }); return ok({ path }); } }) },
    functions: { async invoke(name, o) { calls.push({ fn: name }); return ok({ allowed: false, enabled: false, used_today: 0, daily_limit: 10, mode: 'text' }); } },
  };
  window.supabase = { createClient: () => client };
})();
