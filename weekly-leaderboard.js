/* Only the server can award and rank weekly XP. No private workspace is shared. */
(() => {
 'use strict';
 let client=null,user=null,generation=0,payload=null,loading=false,error='',pending=null,preferenceBusy=false,lastLoaded=0,refreshTimer;
 const number=n=>new Intl.NumberFormat('fr-FR').format(Number(n)||0);
 const visible=()=>['overview','progress'].includes(currentPage)&&!document.body.classList.contains('auth-pending');
 const dateLabel=iso=>new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',timeZone:'Africa/Casablanca'}).format(new Date(iso+'T12:00:00Z'));
 function card(){
  const self=payload?.self;
  const subtitle=payload?`Du ${dateLabel(payload.week_start)} au ${dateLabel(payload.week_end)}`:'Du lundi au dimanche';
  const rows=(payload?.top10||[]).slice(0,10).map(row=>`<tr class="${row.is_self?'weekly-xp-self':''}"><td><span class="weekly-xp-rank ${Number(row.position)<=3?'weekly-xp-leading':''}">${number(row.position)}</span></td><td><span class="weekly-xp-name">${esc(row.display_name)}${row.is_self?'<small>Toi</small>':''}</span></td><td>${esc(row.filiere||'—')}</td><td>${number(row.xp)} <span>XP</span></td></tr>`).join('');
  let content;
  if(error)content=`<div class="weekly-xp-message" role="alert"><p>${esc(error)}</p><button type="button" class="secondary-btn" data-weekly-xp-refresh>Réessayer</button></div>`;
  else if(!payload)content='<div class="weekly-xp-message" role="status"><p>Chargement du classement…</p></div>';
  else if(!rows)content='<div class="weekly-xp-message"><strong>La semaine commence ici.</strong><p>Gagne tes premiers XP pour entrer dans le classement.</p></div>';
  else content=`<table class="weekly-xp-table"><caption class="weekly-xp-sr">Les dix étudiants avec le plus d’XP cette semaine</caption><thead><tr><th scope="col">Rang</th><th scope="col">Étudiant</th><th scope="col">Filière</th><th scope="col">XP cette semaine</th></tr></thead><tbody>${rows}</tbody></table>`;
  const personal=self?`<div class="weekly-xp-personal"><div><span>${self.is_admin?'Compte admin · hors classement':!self.participating?'Ton profil est masqué':self.position?`Ta position · ${number(self.position)}${Number(self.position)===1?'er':'e'}`:'Ta semaine'}</span><strong>${number(self.xp)} <small>XP gagnés</small></strong></div>${!self.is_admin&&!self.position&&self.participating?'<p>Ton premier XP te fait entrer dans la course.</p>':''}</div>`:'';
  const privacy=self&&!self.is_admin?`<label class="weekly-xp-participation"><input type="checkbox" data-weekly-xp-participation ${self.participating?'checked':''} ${preferenceBusy||loading?'disabled':''}><span>Participer au classement</span></label>`:'';
  return `<section class="weekly-xp-card" aria-labelledby="weeklyXpTitle"><header class="weekly-xp-head"><div><span class="weekly-xp-kicker">CLASSEMENT ÉTUDIANT</span><h2 id="weeklyXpTitle">Top 10 de la semaine</h2><p>${esc(subtitle)} · heure du Maroc</p></div><button type="button" class="weekly-xp-refresh" data-weekly-xp-refresh aria-label="Actualiser le classement" ${loading||preferenceBusy?'disabled':''}><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 0 1 15.5-6.3L21 7M21 3v4h-4M21 13a9 9 0 0 1-15.5 6.3L3 17M3 21v-4h4"/></svg><span>Actualiser</span></button></header>${personal}${content}<footer class="weekly-xp-foot"><p>Premier gain d’XP par activité. Nouveau classement chaque lundi.</p>${privacy}<details><summary>Comment les XP sont comptés</summary><p>Cours : 10 XP · Résumé : 15 XP · Exercices faciles : 20 XP · Avancés : 30 XP · Chapitre maîtrisé : 25 XP · Tâche : 25 XP · CNC terminé : 150 XP · Concentration : 2 XP par minute enregistrée à la fin d’une session.</p><p>Les XP sont comptés depuis l’ouverture du classement. Refaire une validation ne rapporte pas de nouveaux points. Les anciens totaux restent conservés.</p><p>Ton prénom, l’initiale de ton nom et ta filière sont visibles aux étudiants connectés. Tu peux masquer ton profil en désactivant ta participation. À égalité, le premier à avoir atteint le total passe devant.</p></details><span class="weekly-xp-status" role="status">${loading?'Actualisation…':preferenceBusy?'Enregistrement…':payload?'Classement synchronisé':''}</span></footer></section>`;
 }
 function paint(){
  if(!client||!['overview','progress'].includes(currentPage))return;
  const existing=document.querySelector('.weekly-xp-card');
  if(existing){
   // Keep keyboard focus when a request redraws the controls.
   const focused=document.activeElement;
   const control=focused?.hasAttribute('data-weekly-xp-refresh')?'[data-weekly-xp-refresh]':focused?.hasAttribute('data-weekly-xp-participation')?'[data-weekly-xp-participation]':null;
   const expanded=existing.querySelector('details')?.open;
   existing.outerHTML=card();
   if(expanded)document.querySelector('.weekly-xp-card details').open=true;
   if(control)document.querySelector('.weekly-xp-card '+control)?.focus();
   return;
  }
  if(currentPage==='overview')document.querySelector('.home-extra')?.insertAdjacentHTML('beforeend',card());
  else {
   const first=document.querySelector('.progress-section');
   if(first)first.insertAdjacentHTML('afterend',card());else document.querySelector('#page')?.insertAdjacentHTML('beforeend',card());
  }
 }
 async function refresh(force=false){
  if(!client||preferenceBusy)return;
  if(pending)return pending;
  const expired=payload?.ends_at&&Date.parse(payload.ends_at)<=Date.now();
  if(!force&&!expired&&Date.now()-lastLoaded<15000)return;
  const gen=generation,c=client;loading=true;error='';paint();
  const request=Promise.resolve().then(async()=>{
   try{
    const result=await c.rpc('weekly_xp_leaderboard');
    if(gen!==generation)return;
    if(result.error)throw result.error;
    if(!result.data||!Array.isArray(result.data.top10)||!result.data.self)throw Error('Invalid ranking');
    payload=result.data;lastLoaded=Date.now();
   }catch(e){if(gen===generation){payload=null;error='Le classement est indisponible. Vérifie ta connexion puis réessaie.';}}
   finally{if(gen===generation){loading=false;pending=null;paint();}}
  });
  pending=request;return request;
 }
 function schedule(){
  clearTimeout(refreshTimer);
  if(client&&visible())refreshTimer=setTimeout(()=>void refresh(true),800);
 }
 function clear(){generation++;client=null;user=null;payload=null;loading=false;error='';pending=null;preferenceBusy=false;lastLoaded=0;clearTimeout(refreshTimer);document.querySelector('.weekly-xp-card')?.remove();}
 window.PrepagoLeaderboard={
  connect(c,id){clear();client=c;user=id;paint();return refresh(true)},clear,refresh
 };
 const previousRender=render;
 render=function(...args){const result=previousRender(...args);paint();if(client&&visible())void refresh();return result};
 document.addEventListener('click',event=>{if(event.target.closest('[data-weekly-xp-refresh]'))void refresh(true)});
 document.addEventListener('change',async event=>{
  const input=event.target.closest('[data-weekly-xp-participation]');
  if(!input||!client||preferenceBusy)return;
  const gen=generation,c=client,enabled=input.checked;
  preferenceBusy=true;error='';paint();
  try{
   const result=await c.rpc('set_weekly_xp_participation',{enabled});
   if(gen!==generation)return;
   if(result.error)throw result.error;
   if(!result.data?.self||!Array.isArray(result.data.top10))throw Error('Invalid preference');
   payload=result.data;lastLoaded=Date.now();
  }catch(e){if(gen===generation){payload=null;error='Ta participation n’a pas été enregistrée. Réessaie.';}}
  finally{if(gen===generation){preferenceBusy=false;paint();}}
 });
 window.addEventListener('prepago:xp-synced',schedule);
 window.addEventListener('prepago:study-changed',schedule);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&visible())void refresh(true)});
 // The server selects the current week; this also refreshes an open page after Monday.
 setInterval(()=>{if(document.visibilityState==='visible'&&visible())void refresh(true)},60000);
})();
