const { createClient } = window.supabase;

const supabase = createClient(
  'https://szrrrqqpmjourdbckojw.supabase.co',
  'sb_publishable_sHZmN-PcQfQSomxWKJo3IA_BrvYYbh-',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }
);

const appState = window.PrepagoState;
const gate = document.querySelector('#authGate');
const authCard = document.querySelector('#authCard');
const confirmCard = document.querySelector('#confirmCard');
const confirmEmail = document.querySelector('#confirmEmail');
const confirmStatus = document.querySelector('#confirmStatus');
const resendConfirmation = document.querySelector('#resendConfirmation');
const backToLogin = document.querySelector('#backToLogin');
const recoveryCard = document.querySelector('#recoveryCard');
const recoveryForm = document.querySelector('#recoveryForm');
const recoveryStatus = document.querySelector('#recoveryStatus');
const accessCard = document.querySelector('#accessGate');
const promoForm = document.querySelector('#promoForm');
const promoCodeInput = document.querySelector('#promoCodeInput');
const promoStatus = document.querySelector('#promoStatus');
const form = document.querySelector('#authForm');
const status = document.querySelector('#authStatus');
const submit = document.querySelector('#authSubmit');
const signupFields = document.querySelector('.auth-signup-fields');
const forgot = document.querySelector('#forgotPassword');
const trialBadge = document.querySelector('#trialBadge');
const signOutButtons = [document.querySelector('#signOutBtn'), document.querySelector('#accessSignOut')];

let mode = 'login';
let currentUser = null;
let accessAllowed = false;
let loadedUserId = null;
let pendingState = null;
let syncTimer = null;
let syncChain = Promise.resolve();
let syncRevision = null;
let syncConflict = false;
let syncRefreshing = false;
let currentProfile = null;
let sessionGeneration = 0;
let loadingUser = null;
let authReady = false;
let authBusy = false;
let recoverySessionReady = false;
let recoveryCallbackInvalid = false;
let signOutBusy = false;
const callback = window.PrepagoAuthCore.readCallback(window.location.href);
const resetRequestForm = document.querySelector('#resetRequestForm');
const resetRequestStatus = document.querySelector('#resetRequestStatus');
const syncIndicator = document.createElement('button');
syncIndicator.className = 'sync-indicator';
syncIndicator.type = 'button';
syncIndicator.textContent = 'Synchronisation…';
syncIndicator.setAttribute('aria-live', 'polite');
document.querySelector('.topbar-actions').prepend(syncIndicator);
function syncStatus(text) { syncIndicator.textContent = text; }
let recoveryMode = callback.recovery;
const pendingEmailKey = 'prepago_pending_confirmation_email';
// An activation code typed at sign-up is stored with the account, so it is applied at the
// first login even when the confirmation e-mail is opened on another device.
const activationCodePattern = /^[A-Z0-9_-]{3,64}$/;
const activationTried = new Set();
const codeField = document.querySelector('#authCodeField');
function pendingActivationCode(user) {
  const code = String(user?.user_metadata?.activation_code || '').trim().toUpperCase();
  return activationCodePattern.test(code) ? code : null;
}
async function redeemActivationCode(code) {
  try {
    const { data, error } = await supabase.rpc('redeem_promo_code', { input_code: code });
    if (error) return { success: false, message: friendlyError(error) };
    const result = Array.isArray(data) ? data[0] : data;
    return { success: Boolean(result?.success), message: promoMessage(result?.message) };
  } catch (error) {
    return { success: false, message: friendlyError(error) };
  } finally {
    // One attempt only: the stored code is cleared whether or not it worked.
    void supabase.auth.updateUser({ data: { activation_code: null } }).catch(() => {});
  }
}

function setStatus(message = '', success = false) {
  status.textContent = message;
  status.classList.toggle('success', success);
}

function friendlyError(error) {
  const code = error?.code || '';
  if (code === 'invalid_track') return 'Choisis une filière CPGE : MPSI/MP, PCSI/PSI, TSI, ECS ou ECT.';
  if (code === 'invalid_activation_code') return 'Ce code d’activation n’a pas le bon format. Vérifie-le, ou laisse le champ vide pour l’ajouter plus tard.';
  if (code === 'invalid_credentials') return 'E-mail ou mot de passe incorrect.';
  if (code === 'email_not_confirmed') return 'Confirme d’abord ton adresse e-mail.';
  if (code === 'user_already_exists') return 'Un compte existe déjà avec cette adresse.';
  if (code === 'weak_password') return 'Choisis un mot de passe plus sécurisé.';
  if (code === 'same_password') return 'Choisis un mot de passe différent de l’ancien.';
  if (['otp_expired','bad_code_verifier','flow_state_not_found','flow_state_expired'].includes(code)) return 'Ce lien a expiré ou a déjà été utilisé. Demande un nouvel e-mail.';
  if (['session_not_found','refresh_token_not_found','refresh_token_already_used'].includes(code)) return 'Ta session a expiré. Reconnecte-toi.';
  if (['over_request_rate_limit','over_email_send_rate_limit','email_rate_limit_exceeded'].includes(code) || error?.status === 429) return 'Trop de tentatives. Patiente quelques minutes avant de réessayer.';
  if (['email_address_not_authorized','email_address_invalid'].includes(code)) return 'L’envoi d’e-mails est indisponible pour cette adresse. Contacte le support.';
  if (/fetch|network|offline/i.test(error?.message || '')) return 'Connexion indisponible. Vérifie ton réseau et réessaie.';
  return 'Impossible de terminer cette action. Réessaie dans quelques instants.';
}

function setMode(nextMode) {
  mode = nextMode;
  const signingUp = mode === 'signup';
  document.querySelectorAll('[data-auth-mode]').forEach(button => {
    const active = button.dataset.authMode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  signupFields.hidden = !signingUp;
  signupFields.querySelector('[name="full_name"]').required = signingUp;
  signupFields.querySelector('[name="filiere"]').required = signingUp;
  if (codeField) codeField.hidden = !signingUp;
  form.elements.password.autocomplete = signingUp ? 'new-password' : 'current-password';
  form.elements.password.minLength = signingUp ? 8 : 1;
  document.querySelector('#authKicker').textContent = signingUp ? 'TON COMPTE ÉTUDIANT' : 'BON RETOUR';
  document.querySelector('#authTitle').textContent = signingUp ? 'Crée ton espace' : 'Connecte-toi';
  document.querySelector('#authSubtitle').textContent = signingUp ? 'Organise ta prépa dès aujourd’hui.' : 'Reprends là où tu t’es arrêté.';
  submit.textContent = signingUp ? 'Créer mon compte' : 'Se connecter';
  forgot.hidden = signingUp;
  setStatus();
}

function profileHasAccess(profile) {
  const now = Date.now();
  if (profile.subscription_status === 'active') {
    return !profile.subscription_ends_at || new Date(profile.subscription_ends_at).getTime() > now;
  }
  if (profile.subscription_status === 'promo') {
    return Boolean(profile.subscription_ends_at) && new Date(profile.subscription_ends_at).getTime() > now;
  }
  return profile.subscription_status === 'trial'
    && Boolean(profile.trial_ends_at)
    && new Date(profile.trial_ends_at).getTime() > now;
}

function updateTrialBadge(profile) {
  if (profile.subscription_status === 'active') {
    trialBadge.textContent = 'Abonnement actif';
  } else if (profile.subscription_status === 'promo') {
    const remaining = Math.max(1, Math.ceil((new Date(profile.subscription_ends_at).getTime() - Date.now()) / 86400000));
    trialBadge.textContent = `Accès promo · ${remaining} j`;
  } else {
    const remaining = Math.max(1, Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / 86400000));
    trialBadge.textContent = `Essai gratuit · ${remaining} j`;
  }
  trialBadge.hidden = false;
}

function showLogin() {
  document.body.classList.add('auth-pending');
  gate.hidden = false;
  authCard.hidden = false;
  confirmCard.hidden = true;
  recoveryCard.hidden = true;
  accessCard.hidden = true;
  trialBadge.hidden = true;
  document.querySelector('#signOutBtn').hidden = true;
  loadedUserId = null;
}

function showConfirmation(email) {
  document.body.classList.remove('landing-view');
  const normalizedEmail = email.trim().toLowerCase();
  localStorage.setItem(pendingEmailKey, normalizedEmail);
  document.body.classList.add('auth-pending');
  gate.hidden = false;
  authCard.hidden = true;
  recoveryCard.hidden = true;
  accessCard.hidden = true;
  confirmCard.hidden = false;
  confirmEmail.textContent = normalizedEmail;
  confirmStatus.textContent = '';
  confirmStatus.classList.remove('success');
  trialBadge.hidden = true;
  document.querySelector('#signOutBtn').hidden = true;
}

function showRecovery() {
  document.body.classList.remove('landing-view');
  document.body.classList.add('auth-pending');
  gate.hidden = false;
  authCard.hidden = true;
  confirmCard.hidden = true;
  recoveryCard.hidden = false;
  accessCard.hidden = true;
  recoveryForm.hidden = !recoverySessionReady;
  resetRequestForm.hidden = recoverySessionReady;
  document.querySelector('#recoveryTitle').textContent = recoverySessionReady ? 'Choisis un nouveau mot de passe' : 'Réinitialise ton mot de passe';
  document.querySelector('#recoveryHelp').textContent = recoverySessionReady ? 'Utilise au moins 8 caractères.' : 'Saisis ton adresse e-mail pour recevoir un nouveau lien.';
}

function showAccess() {
  document.body.classList.remove('landing-view');
  document.body.classList.add('auth-pending');
  gate.hidden = false;
  authCard.hidden = true;
  confirmCard.hidden = true;
  recoveryCard.hidden = true;
  accessCard.hidden = false;
  const accessLabel = window.PrepagoAccount?.statusLabel(currentProfile) || 'Inactif';
  document.querySelector('#accessStatus').textContent = accessLabel === 'Expiré'
    ? 'Ton accès a expiré. Saisis un nouveau code pour retrouver ton espace.'
    : accessLabel === 'Résilié'
      ? 'Ton accès est arrêté. Saisis un code pour le rouvrir.'
      : 'Ton compte est prêt. Il reste à saisir ton code pour ouvrir ton espace.';
  promoStatus.textContent = '';
  promoStatus.classList.remove('success');
  trialBadge.hidden = true;
  document.querySelector('#signOutBtn').hidden = true;
}

function showApp(profile) {
  document.body.classList.remove('landing-view');
  localStorage.removeItem(pendingEmailKey);
  updateTrialBadge(profile);
  document.querySelector('#signOutBtn').hidden = false;
  gate.hidden = true;
  document.body.classList.remove('auth-pending');
}

function scheduleCloudSave(nextState) {
  if (!currentUser || !accessAllowed) return;
  pendingState = nextState;
  try { localStorage.setItem(`prepago-unsynced-${currentUser.id}`, JSON.stringify(nextState)); } catch {}
  syncStatus('Enregistrement…');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(flushCloudState, 650);
}

function flushCloudState() {
  clearTimeout(syncTimer);
  if (!currentUser || !accessAllowed || !pendingState) return syncChain;
  const snapshot = pendingState;
  const userId = currentUser.id;
  pendingState = null;
  syncChain = syncChain.then(async () => {
    if (currentUser?.id !== userId) return;
    const { data, error } = await supabase.rpc('save_student_state', {
      next_data: snapshot,
      expected_updated_at: syncRevision
    });
    if (currentUser?.id !== userId) return;
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.saved) { syncConflict = true; throw new Error('state_conflict'); }
    syncRevision = result.server_updated_at;
    window.dispatchEvent(new Event('prepago:xp-synced'));
    if (currentUser?.id === userId && !pendingState) {
      localStorage.removeItem(`prepago-unsynced-${userId}`);
      syncStatus('Enregistré');
    }
  }).catch(() => {
    if (currentUser?.id === userId) {
      pendingState ||= snapshot;
      syncStatus(syncConflict ? 'Conflit · Voir les options' : 'Non synchronisé · Réessayer');
      void window.PrepagoSupport?.record(syncConflict ? 'sync_conflict' : 'cloud_sync_failure');
    }
  });
  return syncChain;
}

function workspaceIsBusy() {
  return document.hidden || (typeof focusRun === 'object' && focusRun.running)
    || (typeof cncTimer === 'object' && cncTimer.running) || Boolean(window.PrepagoFocus?.snapshot?.().active)
    || document.querySelector('#modalBackdrop')?.hidden === false || Boolean(document.querySelector('dialog[open]'))
    || ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
}
async function refreshCloudState(manual=false) {
  if (!currentUser || !accessAllowed || pendingState || syncConflict || syncRefreshing || workspaceIsBusy()) return false;
  syncRefreshing=true;
  const userId=currentUser.id,generation=sessionGeneration,revision=syncRevision;
  try {
    await syncChain;
    if (pendingState || syncConflict || currentUser?.id!==userId || generation!==sessionGeneration) return false;
    const [workspaceResult,profileResult]=await Promise.all([
      supabase.from('student_app_state').select('data,updated_at').eq('user_id',userId).maybeSingle(),
      supabase.from('profiles').select('full_name,filiere,trial_started_at,trial_ends_at,subscription_status,subscription_ends_at,subscription_plan').eq('id',userId).single()
    ]);
    if (workspaceResult.error || profileResult.error) throw workspaceResult.error || profileResult.error;
    const data=workspaceResult.data;
    if (currentUser?.id!==userId || generation!==sessionGeneration || syncRevision!==revision || pendingState || syncConflict || workspaceIsBusy()) return false;
    const previousTrack=currentProfile.filiere,previousName=currentProfile.full_name,previousPlan=currentProfile.subscription_plan;
    Object.assign(currentProfile,profileResult.data);
    if(!profileHasAccess(currentProfile)){accessAllowed=false;appState.onSave(null);showAccess();return false;}
    if(previousPlan!==currentProfile.subscription_plan)void window.PrepagoAILive?.connect(supabase,userId);
    if (data?.data && (data.updated_at!==syncRevision || previousTrack!==currentProfile.filiere || previousName!==currentProfile.full_name)) {
      syncRevision=data.updated_at;
      const next=window.PrepagoCurriculum.prepare(data.data,currentProfile.filiere,window.PrepagoCurriculumCatalog).state;
      if(currentProfile.full_name)next.profileName=currentProfile.full_name;
      (appState.refresh || appState.replace)(next);
      syncStatus('Mis à jour depuis ton compte');
      window.dispatchEvent(new Event('prepago:workspace-refreshed'));
      return true;
    }
    if(manual)syncStatus('Enregistré');
    return false;
  } catch { if(manual&&currentUser?.id===userId)syncStatus('Vérification impossible · Réessayer'); return false; }
  finally {syncRefreshing=false;}
}
window.PrepagoSync={
 async flush(){await flushCloudState();if(pendingState||syncConflict)throw Error('Workspace not synchronized');},
 refresh:()=>refreshCloudState(true),
 async restore(next){
  if(!currentUser||!accessAllowed)throw Error('Authentication required');
  const userId=currentUser.id,generation=sessionGeneration;
  await this.flush();if(currentUser?.id!==userId||generation!==sessionGeneration)throw Error('Account changed');
  const prepared=window.PrepagoCurriculum.prepare(next,currentProfile.filiere,window.PrepagoCurriculumCatalog).state;
  prepared.profileName=currentProfile.full_name;appState.replace(prepared);window.PrepagoFocus?.refreshMirror?.();
  scheduleCloudSave(appState.snapshot());await this.flush();
 }
};

async function loadUser(session) {
  if (!session?.user) return;
  if (loadingUser?.id === session.user.id) return loadingUser.promise;
  const pending = {id:session.user.id,promise:null};
  pending.promise = loadUserData(session).finally(() => { if (loadingUser === pending) loadingUser = null; });
  loadingUser = pending;
  return pending.promise;
}

async function loadUserData(session) {
  if (!session?.user || loadedUserId === session.user.id) return;
  if (currentUser?.id !== session.user.id) sessionGeneration++;
  currentUser = session.user;
  window.PrepagoCncLibrary?.clear();
  window.PrepagoFocus?.clear();
  window.PrepagoLeaderboard?.clear();
  const userId = currentUser.id;
  window.PrepagoAdmin?.clear();
  window.PrepagoPromos?.clear();
  window.PrepagoSupport?.clear();
  window.PrepagoAILive?.clear();
  const generation = sessionGeneration;
  const cached = appState.useUser(currentUser.id);
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name,filiere,trial_started_at,trial_ends_at,subscription_status,subscription_ends_at,subscription_plan')
    .eq('id', currentUser.id)
    .single();

  if (profileError) throw profileError;
  if (generation !== sessionGeneration || currentUser?.id !== userId) return;
  currentProfile = profile;
  window.PrepagoCncLibrary?.connect(supabase, userId);
  const roleResult = await supabase.from('user_roles').select('role').eq('user_id',userId).maybeSingle();
  if (roleResult.error) throw roleResult.error;
  if (generation !== sessionGeneration || currentUser?.id !== userId) return;
  window.PrepagoPromos?.connect(supabase, userId, roleResult.data?.role === 'admin');
  window.PrepagoAccount = { profile, email: currentUser.email, isAdmin:roleResult.data?.role === 'admin', statusLabel, friendlyError,
    async changePassword(values) {
      if (values.password.length < 8) throw {code:'weak_password'};
      if (values.password !== values.confirmation) throw {code:'password_mismatch'};
      // Use a separate, nonpersistent session to verify the current password
      // without replacing the user's workspace session or firing its listeners.
      const verifier=createClient('https://szrrrqqpmjourdbckojw.supabase.co','sb_publishable_sHZmN-PcQfQSomxWKJo3IA_BrvYYbh-',{
        auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'prepago-password-check'}
      });
      try {
        const verified=await verifier.auth.signInWithPassword({email:currentUser.email,password:values.current_password});
        if(verified.error)throw verified.error;
        const {error}=await supabase.auth.updateUser({password:values.password,current_password:values.current_password});
        if(error)throw error;
      } finally { await verifier.auth.signOut({scope:'local'}).catch(()=>{}); }
    },
    signOut, async update(values) {
      const full_name = values.full_name.trim();
      if (!full_name) throw new Error('Nom requis');
      const filiere=window.PrepagoCurriculum.normalizeTrack(values.filiere);
      if(!filiere)throw {code:'invalid_track'};
      const {error} = await supabase.from('profiles').update({full_name, filiere}).eq('id', userId);
      if (error) throw error;
      Object.assign(profile, {full_name, filiere});
      const next=window.PrepagoCurriculum.prepare(appState.snapshot(),filiere,window.PrepagoCurriculumCatalog).state;
      next.profileName=full_name;appState.replace(next);scheduleCloudSave(appState.snapshot());
    }
  };
  window.PrepagoAdmin?.connect(supabase,roleResult.data?.role === 'admin');
  window.PrepagoSupport?.connect(supabase,userId,roleResult.data?.role === 'admin');
  void window.PrepagoAILive?.connect(supabase,userId);
  accessAllowed = profileHasAccess(profile);
  let activationNotice = null;
  const pendingCode = accessAllowed ? null : pendingActivationCode(currentUser);
  if (pendingCode && !activationTried.has(userId)) {
    activationTried.add(userId);
    const outcome = await redeemActivationCode(pendingCode);
    if (generation !== sessionGeneration || currentUser?.id !== userId) return;
    if (outcome.success) {
      const refreshed = await supabase
        .from('profiles')
        .select('full_name,filiere,trial_started_at,trial_ends_at,subscription_status,subscription_ends_at,subscription_plan')
        .eq('id', userId)
        .single();
      if (generation !== sessionGeneration || currentUser?.id !== userId) return;
      if (refreshed.error) throw refreshed.error;
      Object.assign(profile, refreshed.data);
      accessAllowed = profileHasAccess(profile);
    } else {
      activationNotice = { code: pendingCode, message: outcome.message };
    }
  }
  if (!accessAllowed) {
    loadedUserId = userId;
    appState.onSave(null);
    showAccess();
    if (activationNotice) {
      promoCodeInput.value = activationNotice.code;
      promoStatus.textContent = activationNotice.message;
    }
    return;
  }

  const { data: stored, error: stateError } = await supabase
    .from('student_app_state')
    .select('data,updated_at')
    .eq('user_id', currentUser.id)
    .maybeSingle();
  if (stateError) throw stateError;
  if (generation !== sessionGeneration || currentUser?.id !== userId) return;
  syncRevision = stored?.updated_at || null;
  syncConflict = false;

  // Unclaimed legacy browser data must never be imported into an arbitrary account.
  const nextState = stored?.data || cached || appState.snapshot();
  if ((!nextState.profileName || nextState.profileName === 'Préparationnaire') && profile.full_name) {
    nextState.profileName = profile.full_name;
  }
  const programme=window.PrepagoCurriculum.prepare(nextState,profile.filiere,window.PrepagoCurriculumCatalog,{fresh:!stored&&!cached});
  appState.replace(programme.state);
  appState.onSave(scheduleCloudSave);

  syncStatus('Enregistré');
  const unsynced = localStorage.getItem(`prepago-unsynced-${userId}`);
  const recoverableDraft = unsynced ? window.PrepagoSupportCore?.draft(unsynced) : null;
  if (unsynced && !recoverableDraft) {
    syncStatus('Copie locale illisible · Version du compte chargée');
    void window.PrepagoSupport?.record('invalid_local_draft');
  }
  if (recoverableDraft) {
    // Preserve a failed write across refresh without silently overwriting another device.
    syncStatus('Brouillon local à récupérer');
    window.PrepagoRecoverDraft = () => {
      if (!confirm('Restaurer le brouillon de cet appareil ? Il remplacera les données chargées depuis ton compte.')) return;
      appState.replace(recoverableDraft); scheduleCloudSave(appState.snapshot());
      window.PrepagoRecoverDraft = null;
    };
  }

  if (!stored || programme.changed) {
    pendingState = appState.snapshot();
    await flushCloudState();
  }
  showApp(profile);
  loadedUserId = userId;
  window.PrepagoFocus?.connect(supabase, userId);
  window.PrepagoLeaderboard?.connect(supabase, userId);
}

async function handleSession(session) {
  if (recoveryMode) {
    recoverySessionReady = !recoveryCallbackInvalid && Boolean(session?.user);
    currentUser = recoverySessionReady ? session.user : null;
    showRecovery();
    return;
  }
  if (!session) {
    sessionGeneration++;
    pendingState = null;
    clearTimeout(syncTimer);
    currentUser = null;
    currentProfile = null;
    window.PrepagoAccount = null;
    window.PrepagoPromos?.clear();
    window.PrepagoAdmin?.clear();
    window.PrepagoSupport?.clear();
    window.PrepagoAILive?.clear();
    window.PrepagoCncLibrary?.clear();
    window.PrepagoFocus?.clear();
    window.PrepagoLeaderboard?.clear();
    window.PrepagoRecoverDraft = null;
    accessAllowed = false;
    appState.onSave(null);
    appState.reset();
    showLogin();
    return;
  }
  try {
    await loadUser(session);
  } catch (error) {
    if (currentUser?.id !== session.user.id) return;
    loadedUserId = null;
    showLogin();
    document.body.classList.remove('landing-view');
    setStatus('Impossible de charger ton compte. Vérifie ta connexion puis reconnecte-toi.');
  }
}

document.querySelectorAll('[data-auth-mode]').forEach(button => {
  button.addEventListener('click', () => setMode(button.dataset.authMode));
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (authBusy || !authReady) return;
  authBusy = true;
  setStatus();
  submit.disabled = true;
  submit.textContent = mode === 'signup' ? 'Création…' : 'Connexion…';
  const values = Object.fromEntries(new FormData(form));
  const email = values.email.trim().toLowerCase();
  try {
    if (mode === 'signup') {
      if(!window.PrepagoCurriculum.normalizeTrack(values.filiere))throw {code:'invalid_track'};
      const activationCode = String(values.activation_code || '').trim().toUpperCase();
      if (activationCode && !activationCodePattern.test(activationCode)) throw {code:'invalid_activation_code'};
      const { data, error } = await supabase.auth.signUp({
        email,
        password: values.password,
        options: {
          data: { full_name: values.full_name.trim(), filiere: window.PrepagoCurriculum.normalizeTrack(values.filiere), ...(activationCode ? { activation_code: activationCode } : {}) },
          emailRedirectTo: 'https://prepago.site/verification/'
        }
      });
      if (error) throw error;
      if (data.session) await loadUser(data.session);
      else showConfirmation(email);
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: values.password
      });
      if (error) {
        const unconfirmed = error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message || '');
        if (unconfirmed) {
          showConfirmation(email);
          return;
        }
        throw error;
      }
      await loadUser(data.session);
    }
  } catch (error) {
    setStatus(friendlyError(error));
  } finally {
    authBusy = false;
    submit.disabled = false;
    submit.textContent = mode === 'signup' ? 'Créer mon compte' : 'Se connecter';
  }
});

resendConfirmation.addEventListener('click', async () => {
  const email = confirmEmail.textContent.trim();
  if (!email) return;
  resendConfirmation.disabled = true;
  resendConfirmation.textContent = 'Envoi…';
  confirmStatus.textContent = '';
  confirmStatus.classList.remove('success');
  try {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: 'https://prepago.site/verification/' }
  });
  resendConfirmation.disabled = false;
  resendConfirmation.textContent = 'Renvoyer l’e-mail';
  confirmStatus.textContent = error ? friendlyError(error) : 'E-mail renvoyé. Vérifie aussi tes spams.';
  confirmStatus.classList.toggle('success', !error);
  } catch (error) { confirmStatus.textContent = friendlyError(error); }
  finally { resendConfirmation.disabled = false; resendConfirmation.textContent = 'Renvoyer l’e-mail'; }
});

backToLogin.addEventListener('click', () => {
  showLogin();
  setMode('login');
  form.elements.email.value = confirmEmail.textContent;
  form.elements.password.focus();
});

promoForm.addEventListener('submit', async event => {
  event.preventDefault();
  const code = promoCodeInput.value.trim().toUpperCase();
  if (!code) return;
  const button = promoForm.querySelector('button[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  promoStatus.textContent = 'Vérification du code…';
  promoStatus.classList.remove('success');
  try {
  const { data, error } = await supabase.rpc('redeem_promo_code', { input_code: code });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) {
    promoStatus.textContent = error ? friendlyError(error) : promoMessage(result?.message);
    return;
  }
  promoStatus.textContent = 'Code activé. Ton accès est débloqué.';
  promoStatus.classList.add('success');
  promoCodeInput.value = '';
  loadedUserId = null;
  const { data: { session } } = await supabase.auth.getSession();
  await loadUser(session);
  } catch (error) { promoStatus.textContent = friendlyError(error); }
  finally { button.disabled = false; }
});

forgot.addEventListener('click', async () => {
  const email = form.elements.email.value.trim().toLowerCase();
  if (!email) {
    setStatus('Saisis d’abord ton adresse e-mail.');
    form.elements.email.focus();
    return;
  }
  if (!form.elements.email.checkValidity()) { form.elements.email.reportValidity(); return; }
  forgot.disabled = true;
  try {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://prepago.site/nouveau-mot-de-passe/'
  });
  forgot.disabled = false;
  setStatus(error ? friendlyError(error) : 'Lien de réinitialisation envoyé par e-mail.', !error);
  } catch(error) { setStatus(friendlyError(error)); }
  finally { forgot.disabled = false; }
});

recoveryForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!recoverySessionReady || !currentUser) { showRecovery(); return; }
  const values = Object.fromEntries(new FormData(recoveryForm));
  recoveryStatus.classList.remove('success');
  if (values.password !== values.confirmation) {
    recoveryStatus.textContent = 'Les deux mots de passe ne correspondent pas.';
    return;
  }
  const button = recoveryForm.querySelector('button[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  try {
  const { error } = await supabase.auth.updateUser({ password: values.password });
  button.disabled = false;
  if (error) {
    recoveryStatus.textContent = friendlyError(error);
    return;
  }
  recoveryStatus.textContent = 'Mot de passe mis à jour.';
  recoveryStatus.classList.add('success');
  recoveryMode = false;
  recoverySessionReady = false;
  recoveryForm.reset();
  history.replaceState({}, document.title, '/#dashboard');
  loadedUserId = null;
  const { data: { session } } = await supabase.auth.getSession();
  await handleSession(session);
  } catch(error) { recoveryStatus.textContent = friendlyError(error); }
  finally { button.disabled = false; }
});

resetRequestForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = resetRequestForm.querySelector('button');
  if (button.disabled) return;
  button.disabled = true;
  resetRequestStatus.textContent = 'Envoi…';
  try {
    const {error} = await supabase.auth.resetPasswordForEmail(resetRequestForm.elements.email.value.trim().toLowerCase(),{redirectTo:'https://prepago.site/nouveau-mot-de-passe/'});
    if (error) throw error;
    resetRequestStatus.textContent = 'Si un compte existe avec cette adresse, un lien a été envoyé. Vérifie aussi tes spams.';
    resetRequestStatus.classList.add('success');
  } catch(error) { resetRequestStatus.classList.remove('success'); resetRequestStatus.textContent = friendlyError(error); }
  finally { button.disabled = false; }
});
document.querySelector('#recoveryBack').addEventListener('click', async () => {
  recoveryMode = false; recoverySessionReady = false;
  history.replaceState({},document.title,'/#connexion');
  const {data:{session}} = await supabase.auth.getSession();
  await handleSession(session);
});

async function signOut() {
  if (signOutBusy) return;
  signOutBusy = true;
  try {
  await window.PrepagoFocus?.pauseForSignOut();
  window.dispatchEvent(new Event('prepago:pause-timers'));
  await flushCloudState();
  const {error} = await supabase.auth.signOut();
  if (error) { window.showToast?.(friendlyError(error)); return; }
  sessionGeneration++;
  pendingState = null;
  clearTimeout(syncTimer);
  currentUser = null;
  accessAllowed = false;
  loadedUserId = null;
  currentProfile = null;
  window.PrepagoAccount = null;
  window.PrepagoPromos?.clear();
  window.PrepagoAdmin?.clear();
  window.PrepagoSupport?.clear();
  window.PrepagoAILive?.clear();
  window.PrepagoCncLibrary?.clear();
  window.PrepagoFocus?.clear();
  window.PrepagoLeaderboard?.clear();
  window.PrepagoRecoverDraft = null;
  appState.onSave(null);
  appState.reset();
  recoveryMode = false;
  form.reset();
  setMode('login');
  showLogin();
  document.body.classList.remove('landing-view');
  history.replaceState({},document.title,'/#connexion');
  } catch(error) { window.showToast?.(friendlyError(error)); }
  finally { signOutBusy = false; }
}

signOutButtons.forEach(button => button?.addEventListener('click', signOut));
window.addEventListener('pagehide', flushCloudState);
window.addEventListener('online', async()=>{await flushCloudState();void refreshCloudState();});
syncIndicator.addEventListener('click', () => {
  if (syncConflict) {
    window.showToast?.('Un autre appareil a enregistré des changements. Ton brouillon est conservé sur cet appareil. Recharge la page pour récupérer la version en ligne.');
    return;
  }
  return window.PrepagoRecoverDraft ? window.PrepagoRecoverDraft() : pendingState ? flushCloudState() : refreshCloudState(true);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) flushCloudState(); else void refreshCloudState(); });
setInterval(()=>void refreshCloudState(),45000);
setInterval(async () => {
  if (currentProfile && accessAllowed && !profileHasAccess(currentProfile)) {
    await window.PrepagoFocus?.pauseForSignOut();
    window.dispatchEvent(new Event('prepago:pause-timers'));
    accessAllowed = false; appState.onSave(null); showAccess();
  }
}, 30000);

function statusLabel(profile) {
  if (profile && ['active','promo','trial'].includes(profile.subscription_status) && !profileHasAccess(profile)) return 'Expiré';
  return {inactive:'Inactif',trial:'Essai',promo:'Accès promo',active:'Actif',expired:'Expiré',cancelled:'Résilié'}[profile?.subscription_status] || 'Inactif';
}
function promoMessage(message) {
  return {'Authentication required':'Connecte-toi pour utiliser un code.', 'Enter a promo code':'Saisis un code promo.', 'A promo code has already been used on this account':'Un code promo a déjà été utilisé sur ce compte.', 'Invalid promo code':'Ce code promo est invalide.', 'This promo code is inactive':'Ce code promo est désactivé.', 'This promo code has expired':'Ce code promo a expiré.', 'This promo code has reached its usage limit':'Ce code a atteint sa limite d’utilisation.'}[message] || String(message || 'Code indisponible. Réessaie.').replace(/code promo/g, 'code');
}

supabase.auth.onAuthStateChange((event, session) => {
  if (!authReady) return;
  setTimeout(() => {
    if (event === 'PASSWORD_RECOVERY') {
      recoveryMode = true;
      currentUser = session?.user || null;
      recoverySessionReady = Boolean(session?.user);
      showRecovery();
      return;
    }
    handleSession(session);
  }, 0);
});

setMode(location.hash === '#inscription' ? 'signup' : 'login');
submit.disabled = true;
try {
  const session = await window.PrepagoAuthCore.resolveCallback(supabase.auth,callback);
  if (callback.hasCallback) history.replaceState({},document.title,window.PrepagoAuthCore.cleanCallback(location.href,recoveryMode));
  if (callback.forgot) recoveryMode = true;
  authReady = true;
  await handleSession(session);
} catch(error) {
  authReady = true;
  if (callback.hasCallback) history.replaceState({},document.title,window.PrepagoAuthCore.cleanCallback(location.href,recoveryMode));
  if (recoveryMode) { recoveryCallbackInvalid = true; recoverySessionReady = false; showRecovery(); resetRequestStatus.textContent = friendlyError(error); }
  else { showLogin(); document.body.classList.remove('landing-view'); setStatus(friendlyError(error)); }
} finally { submit.disabled = false; }
