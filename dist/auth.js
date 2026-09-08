const SUPABASE_URL='https://szrrrqqpmjourdbckojw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_sHZmN-PcQfQSomxWKJo3IA_BrvYYbh-';
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

const authGate=document.querySelector('#authGate');
const loginForm=document.querySelector('#loginForm');
const signupForm=document.querySelector('#signupForm');
const authMessage=document.querySelector('#authMessage');
const authTabs=[...document.querySelectorAll('.auth-tab')];

function setAuthMessage(text,type=''){
  authMessage.textContent=text||'';
  authMessage.className=`auth-message ${type}`.trim();
}

function switchAuth(mode){
  authTabs.forEach(btn=>btn.classList.toggle('active',btn.dataset.authTab===mode));
  document.querySelector('#loginPanel').hidden=mode!=='login';
  document.querySelector('#signupPanel').hidden=mode!=='signup';
  setAuthMessage('');
}

authTabs.forEach(btn=>btn.addEventListener('click',()=>switchAuth(btn.dataset.authTab)));

async function loadCurrentProfile(){
  const {data:{user}}=await supabaseClient.auth.getUser();
  if(!user)return null;
  const {data:profile}=await supabaseClient.from('profiles').select('full_name,filiere,xp,email').eq('id',user.id).single();
  const displayName=profile?.full_name||user.email?.split('@')[0]||'Étudiant';
  document.querySelectorAll('.profile-card strong').forEach(el=>el.textContent=displayName);
  document.querySelectorAll('.profile-card small').forEach(el=>el.textContent=profile?.filiere?`${profile.filiere} · ${user.email}`:user.email||'Espace personnel');
  document.querySelectorAll('.avatar').forEach(el=>el.textContent=displayName.trim().charAt(0).toUpperCase()||'P');
  const saveNote=document.querySelector('.saved-note');
  if(saveNote)saveNote.innerHTML='Compte connecté<br>avec Supabase';
  const deviceSave=document.querySelector('.device-save');
  if(deviceSave)deviceSave.firstChild.textContent='Compte connecté ';
  return {user,profile};
}

async function showApp(){
  authGate.hidden=true;
  await loadCurrentProfile();
}

async function showAuth(){
  authGate.hidden=false;
}

loginForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const submit=loginForm.querySelector('button[type="submit"]');
  submit.disabled=true; setAuthMessage('Connexion...');
  const email=loginForm.email.value.trim();
  const password=loginForm.password.value;
  const {error}=await supabaseClient.auth.signInWithPassword({email,password});
  submit.disabled=false;
  if(error){setAuthMessage(error.message,'error');return;}
  setAuthMessage('Connecté.','success');
  await showApp();
});

signupForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const submit=signupForm.querySelector('button[type="submit"]');
  submit.disabled=true; setAuthMessage('Création du compte...');
  const full_name=signupForm.full_name.value.trim();
  const email=signupForm.email.value.trim();
  const password=signupForm.password.value;
  const filiere=signupForm.filiere.value;
  const {data,error}=await supabaseClient.auth.signUp({
    email,password,
    options:{data:{full_name,filiere}}
  });
  submit.disabled=false;
  if(error){setAuthMessage(error.message,'error');return;}
  if(data.session){setAuthMessage('Compte créé.','success');await showApp();}
  else setAuthMessage('Compte créé. Vérifiez votre e-mail pour confirmer votre inscription.','success');
});

document.querySelector('#logoutBtn').addEventListener('click',async()=>{
  await supabaseClient.auth.signOut();
  switchAuth('login');
  showAuth();
});

supabaseClient.auth.onAuthStateChange(async(_event,session)=>{
  if(session) await showApp(); else showAuth();
});

(async()=>{
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(session) await showApp(); else showAuth();
})();