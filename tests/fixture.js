// Isolated UI test fixture. No Supabase client, credentials, or production account data.
activeStorageKey='prepago-qa-only';
state=structuredClone(defaultState);
state.profileName='Étudiant QA';
state.focusSessions=[{id:'qa-focus',date:todayISO(),minutes:45,subject:'Mathématiques'}];
state.xp=90;
window.PrepagoAccount={profile:{full_name:'Étudiant QA',filiere:'PSI',subscription_status:'active',subscription_plan:'standard'},email:'qa@example.invalid',statusLabel:()=> 'Actif',update:async()=>{},signOut:()=>{document.querySelector('#authGate').hidden=false;document.body.classList.add('auth-pending')}};
restoreRuntimeState();
document.body.classList.remove('auth-pending');
document.querySelector('#authGate').hidden=true;
render();
if(new URLSearchParams(location.search).get('mode')==='pricing'){
 document.body.classList.add('auth-pending');
 document.querySelector('#authGate').hidden=false;
 document.querySelector('#authCard').hidden=true;
 document.querySelector('#accessGate').hidden=false;
 document.querySelector('#accessStatus').textContent='Statut : Inactif';
}
