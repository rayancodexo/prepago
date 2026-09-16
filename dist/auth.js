import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/+esm';

const supabase = createClient(
  'https://szrrrqqpmjourdbckojw.supabase.co',
  'sb_publishable_sHZmN-PcQfQSomxWKJo3IA_BrvYYbh-',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
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
let currentProfile = null;
let sessionGeneration = 0;
const syncIndicator = document.createElement('button');
syncIndicator.className = 'sync-indicator';
syncIndicator.type = 'button';
syncIndicator.textContent = 'Synchronisation…';
syncIndicator.setAttribute('aria-live', 'polite');
document.querySelector('.topbar-actions').prepend(syncIndicator);
function syncStatus(text) { syncIndicator.textContent = text; }
let recoveryMode = window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery');
const pendingEmailKey = 'prepago_pending_confirmation_email';

function setStatus(message = '', success = false) {
  status.textContent = message;
  status.classList.toggle('success', success);
}

function friendlyError(error) {
  const code = error?.code || '';
  if (code === 'invalid_credentials') return 'E-mail ou mot de passe incorrect.';
  if (code === 'email_not_confirmed') return 'Confirmez d’abord votre adresse e-mail.';
  if (code === 'user_already_exists') return 'Un compte existe déjà avec cette adresse.';
  if (code === 'weak_password') return 'Choisissez un mot de passe plus sécurisé.';
  if (code === 'over_request_rate_limit') return 'Trop de tentatives. Réessayez dans quelques minutes.';
  if (/fetch|network|offline/i.test(error?.message || '')) return 'Connexion indisponible. Vérifiez votre réseau et réessayez.';
  return 'Impossible de terminer cette action. Réessayez dans quelques instants.';
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
  form.elements.password.autocomplete = signingUp ? 'new-password' : 'current-password';
  form.elements.password.minLength = signingUp ? 8 : 1;
  document.querySelector('#authKicker').textContent = signingUp ? 'VOTRE COMPTE ÉTUDIANT' : 'BON RETOUR';
  document.querySelector('#authTitle').textContent = signingUp ? 'Créez votre espace' : 'Connectez-vous';
  document.querySelector('#authSubtitle').textContent = signingUp ? 'Organisez votre prépa dès aujourd’hui.' : 'Continuez là où vous vous êtes arrêté.';
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
  document.body.classList.add('auth-pending');
  gate.hidden = false;
  authCard.hidden = true;
  confirmCard.hidden = true;
  recoveryCard.hidden = false;
  accessCard.hidden = true;
}

function showAccess() {
  document.body.classList.add('auth-pending');
  gate.hidden = false;
  authCard.hidden = true;
  confirmCard.hidden = true;
  recoveryCard.hidden = true;
  accessCard.hidden = false;
  document.querySelector('#accessStatus').textContent = `Statut : ${window.PrepagoAccount?.statusLabel(currentProfile) || 'Inactif'}`;
  promoStatus.textContent = '';
  promoStatus.classList.remove('success');
  trialBadge.hidden = true;
  document.querySelector('#signOutBtn').hidden = true;
}

function showApp(profile) {
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
    if (currentUser?.id === userId && !pendingState) {
      localStorage.removeItem(`prepago-unsynced-${userId}`);
      syncStatus('Enregistré');
    }
  }).catch(() => {
    if (currentUser?.id === userId) {
      pendingState ||= snapshot;
      syncStatus(syncConflict ? 'Conflit · Voir les options' : 'Non synchronisé · Réessayer');
    }
  });
  return syncChain;
}

async function loadUser(session) {
  if (!session?.user || loadedUserId === session.user.id) return;
  currentUser = session.user;
  const userId = currentUser.id;
  const generation = sessionGeneration;
  loadedUserId = currentUser.id;
  const cached = appState.useUser(currentUser.id);
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name,filiere,trial_started_at,trial_ends_at,subscription_status,subscription_ends_at,subscription_plan')
    .eq('id', currentUser.id)
    .single();

  if (profileError) throw profileError;
  if (generation !== sessionGeneration || currentUser?.id !== userId) return;
  currentProfile = profile;
  window.PrepagoAccount = { profile, email: currentUser.email, statusLabel,
    signOut, async update(values) {
      const full_name = values.full_name.trim();
      if (!full_name) throw new Error('Nom requis');
      const {error} = await supabase.from('profiles').update({full_name, filiere: values.filiere}).eq('id', userId);
      if (error) throw error;
      Object.assign(profile, {full_name, filiere: values.filiere});
      const next = appState.snapshot(); next.profileName = full_name; appState.replace(next); scheduleCloudSave(next);
    }
  };
  accessAllowed = profileHasAccess(profile);
  if (!accessAllowed) {
    appState.onSave(null);
    showAccess();
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
  appState.replace(nextState);
  appState.onSave(scheduleCloudSave);

  syncStatus('Enregistré');
  const unsynced = localStorage.getItem(`prepago-unsynced-${userId}`);
  if (unsynced) {
    // Preserve a failed write across refresh without silently overwriting another device.
    syncStatus('Brouillon local à récupérer');
    window.PrepagoRecoverDraft = () => {
      if (!confirm('Restaurer le brouillon de cet appareil ? Il remplacera les données chargées depuis votre compte.')) return;
      appState.replace(JSON.parse(unsynced)); scheduleCloudSave(appState.snapshot());
      window.PrepagoRecoverDraft = null;
    };
  }

  if (!stored) {
    pendingState = appState.snapshot();
    await flushCloudState();
  }
  showApp(profile);
}

async function handleSession(session) {
  if (recoveryMode && session) {
    currentUser = session.user;
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
    loadedUserId = null;
    showLogin();
    setStatus(friendlyError(error));
  }
}

document.querySelectorAll('[data-auth-mode]').forEach(button => {
  button.addEventListener('click', () => setMode(button.dataset.authMode));
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  setStatus();
  submit.disabled = true;
  submit.textContent = mode === 'signup' ? 'Création…' : 'Connexion…';
  const values = Object.fromEntries(new FormData(form));
  const email = values.email.trim().toLowerCase();
  try {
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: values.password,
        options: {
          data: { full_name: values.full_name.trim(), filiere: values.filiere },
          emailRedirectTo: window.location.origin
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
    options: { emailRedirectTo: window.location.origin }
  });
  resendConfirmation.disabled = false;
  resendConfirmation.textContent = 'Renvoyer l’e-mail';
  confirmStatus.textContent = error ? friendlyError(error) : 'E-mail renvoyé. Vérifiez aussi vos spams.';
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

document.querySelectorAll('[data-plan]').forEach(button => {
  button.addEventListener('click', () => {
    promoStatus.textContent = 'Le paiement en ligne sera connecté prochainement. Vous pouvez déjà utiliser un code promo.';
    promoStatus.classList.remove('success');
    promoCodeInput.focus();
  });
});

promoForm.addEventListener('submit', async event => {
  event.preventDefault();
  const code = promoCodeInput.value.trim().toUpperCase();
  if (!code) return;
  const button = promoForm.querySelector('button[type="submit"]');
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
  promoStatus.textContent = 'Code activé. Votre accès est débloqué.';
  promoStatus.classList.add('success');
  promoCodeInput.value = '';
  loadedUserId = null;
  const { data: { session } } = await supabase.auth.getSession();
  await loadUser(session);
  } catch (error) { promoStatus.textContent = friendlyError(error); }
  finally { button.disabled = false; }
});

forgot.addEventListener('click', async () => {
  const email = form.elements.email.value.trim();
  if (!email) {
    setStatus('Saisissez d’abord votre adresse e-mail.');
    form.elements.email.focus();
    return;
  }
  forgot.disabled = true;
  try {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  forgot.disabled = false;
  setStatus(error ? friendlyError(error) : 'Lien de réinitialisation envoyé par e-mail.', !error);
  } catch(error) { setStatus(friendlyError(error)); }
  finally { forgot.disabled = false; }
});

recoveryForm.addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(recoveryForm));
  recoveryStatus.classList.remove('success');
  if (values.password !== values.confirmation) {
    recoveryStatus.textContent = 'Les deux mots de passe ne correspondent pas.';
    return;
  }
  const button = recoveryForm.querySelector('button');
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
  history.replaceState({}, document.title, `${location.pathname}${location.search.replace(/([?&])type=recovery(&|$)/, '$1').replace(/[?&]$/, '')}`);
  loadedUserId = null;
  const { data: { session } } = await supabase.auth.getSession();
  await handleSession(session);
  } catch(error) { recoveryStatus.textContent = friendlyError(error); }
  finally { button.disabled = false; }
});

async function signOut() {
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
  window.PrepagoRecoverDraft = null;
  appState.onSave(null);
  appState.reset();
  recoveryMode = false;
  form.reset();
  setMode('login');
  showLogin();
}

signOutButtons.forEach(button => button?.addEventListener('click', signOut));
window.addEventListener('pagehide', flushCloudState);
window.addEventListener('online', flushCloudState);
syncIndicator.addEventListener('click', () => {
  if (syncConflict) {
    window.showToast?.('Un autre appareil a enregistré des changements. Votre brouillon est conservé sur cet appareil. Rechargez pour récupérer la version en ligne.');
    return;
  }
  return window.PrepagoRecoverDraft ? window.PrepagoRecoverDraft() : flushCloudState();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) flushCloudState(); });
setInterval(() => {
  if (currentProfile && accessAllowed && !profileHasAccess(currentProfile)) {
    window.dispatchEvent(new Event('prepago:pause-timers'));
    accessAllowed = false; appState.onSave(null); showAccess();
  }
}, 30000);

function statusLabel(profile) {
  if (profile && ['active','promo','trial'].includes(profile.subscription_status) && !profileHasAccess(profile)) return 'Expiré';
  return {inactive:'Inactif',trial:'Essai',promo:'Accès promo',active:'Actif',expired:'Expiré',cancelled:'Résilié'}[profile?.subscription_status] || 'Inactif';
}
function promoMessage(message) {
  return {'Authentication required':'Connectez-vous pour utiliser un code.', 'Enter a promo code':'Saisissez un code promo.', 'A promo code has already been used on this account':'Un code promo a déjà été utilisé sur ce compte.', 'Invalid promo code':'Ce code promo est invalide.', 'This promo code is inactive':'Ce code promo est désactivé.', 'This promo code has expired':'Ce code promo a expiré.', 'This promo code has reached its usage limit':'Ce code a atteint sa limite d’utilisation.'}[message] || message || 'Code indisponible. Réessayez.';
}

supabase.auth.onAuthStateChange((event, session) => {
  setTimeout(() => {
    if (event === 'PASSWORD_RECOVERY') {
      recoveryMode = true;
      currentUser = session?.user || null;
      showRecovery();
      return;
    }
    handleSession(session);
  }, 0);
});

setMode('login');
try {
  const { data: { session } } = await supabase.auth.getSession();
  await handleSession(session);
} catch(error) { showLogin(); setStatus(friendlyError(error)); }
