const accessGate=document.querySelector('#accessGate');
const promoForm=document.querySelector('#promoForm');
const promoCodeInput=document.querySelector('#promoCodeInput');
const promoMessage=document.querySelector('#promoMessage');

function setPromoMessage(text,type=''){
  if(!promoMessage)return;
  promoMessage.textContent=text||'';
  promoMessage.className=`promo-message ${type}`.trim();
}

function hasPrepagoAccess(profile){
  if(!profile)return false;
  const now=Date.now();
  if(profile.subscription_status==='active'){
    return !profile.subscription_ends_at || new Date(profile.subscription_ends_at).getTime()>now;
  }
  if(profile.subscription_status==='promo'){
    return !!profile.subscription_ends_at && new Date(profile.subscription_ends_at).getTime()>now;
  }
  if(profile.subscription_status==='trial'){
    return !!profile.trial_ends_at && new Date(profile.trial_ends_at).getTime()>now;
  }
  return false;
}

async function loadAccessProfile(){
  const {data:{user}}=await supabaseClient.auth.getUser();
  if(!user)return null;
  const {data:profile,error}=await supabaseClient
    .from('profiles')
    .select('full_name,filiere,xp,email,subscription_status,subscription_ends_at,trial_ends_at')
    .eq('id',user.id)
    .single();
  if(error)return {user,profile:null};
  return {user,profile};
}

async function refreshAccessGate(){
  const current=await loadAccessProfile();
  if(!current?.user){
    accessGate.hidden=true;
    return false;
  }
  const allowed=hasPrepagoAccess(current.profile);
  accessGate.hidden=allowed;
  authGate.hidden=true;
  return allowed;
}

const originalShowApp=showApp;
showApp=async function(){
  await originalShowApp();
  const allowed=await refreshAccessGate();
  if(!allowed)authGate.hidden=true;
};

const originalShowAuth=showAuth;
showAuth=async function(){
  accessGate.hidden=true;
  await originalShowAuth();
};

if(promoForm){
  promoForm.addEventListener('submit',async e=>{
    e.preventDefault();
    const code=promoCodeInput.value.trim().toUpperCase();
    if(!code)return;
    const submit=promoForm.querySelector('button[type="submit"]');
    submit.disabled=true;
    setPromoMessage('Vérification du code...');
    const {data,error}=await supabaseClient.rpc('redeem_promo_code',{input_code:code});
    submit.disabled=false;
    const result=Array.isArray(data)?data[0]:data;
    if(error||!result?.success){
      setPromoMessage(result?.message||'Code invalide, expiré, déjà utilisé ou indisponible.','error');
      return;
    }
    setPromoMessage('Code activé. Accès Prepago débloqué.','success');
    promoCodeInput.value='';
    await showApp();
  });
}

document.querySelectorAll('[data-plan]').forEach(button=>{
  button.addEventListener('click',()=>{
    setPromoMessage('Le paiement en ligne sera connecté prochainement. Vous pouvez déjà utiliser un code promo.');
    document.querySelector('.promo-card')?.scrollIntoView({behavior:'smooth',block:'center'});
    promoCodeInput?.focus();
  });
});

document.querySelector('#accessLogoutBtn')?.addEventListener('click',async()=>{
  await supabaseClient.auth.signOut();
  accessGate.hidden=true;
  switchAuth('login');
  showAuth();
});

refreshAccessGate();
