// Account-bound support. Reports and replies never share a student's workspace.
(() => {
  'use strict';
  const core=window.PrepagoSupportCore;
  let client=null,userId=null,admin=false,generation=0,busy=false,rows=[],reportContext={};
  const diagnosticTimes=new Map();
  const labels={open:'Reçu',in_progress:'En cours',resolved:'Résolu'};
  const kinds={problem:'Problème technique',content:'Contenu ou document',idea:'Suggestion',privacy:'Demande concernant mes données',technical:'Diagnostic technique'};
  const dialog=document.createElement('dialog');dialog.className='prepago-support-dialog';dialog.setAttribute('aria-labelledby','supportTitle');document.body.append(dialog);
  const date=v=>new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium'}).format(new Date(v));
  const page=()=>core.page(typeof currentPage==='string'?currentPage:'connexion');
  const preferenceKey=()=>`prepago-diagnostics-${userId}`;
  function optedIn(){try{return Boolean(userId)&&localStorage.getItem(preferenceKey())==='true';}catch{return false;}}
  function clear(){generation++;client=null;userId=null;admin=false;busy=false;rows=[];reportContext={};diagnosticTimes.clear();dialog.close();dialog.innerHTML='';}
  function connect(c,id,isAdmin){clear();client=c;userId=id;admin=isAdmin===true;}
  function status(text,error=false){const n=dialog.querySelector('#supportStatus');if(n){n.textContent=text;n.classList.toggle('error',error);}}
  async function loadOwn(){const g=generation,c=client,id=userId;if(!c||!id)return;const r=await c.from('support_reports').select('id,kind,page,title,details,status,reply,created_at,updated_at').eq('user_id',id).neq('kind','technical').order('created_at',{ascending:false}).limit(10);if(g!==generation)return;if(r.error)throw r.error;rows=r.data||[];}
  function history(){return `<section class="support-history"><h3>Mes derniers signalements</h3>${rows.map(r=>`<article class="support-report"><small>${labels[r.status]} · ${date(r.created_at)} · ${esc(r.id.slice(0,8))}</small><h3>${esc(r.title)}</h3><p>${esc(r.details)}</p>${r.reply?`<div class="support-reply"><strong>Réponse de Prepago</strong><p>${esc(r.reply)}</p></div>`:''}</article>`).join('')||'<p>Aucun signalement pour le moment.</p>'}</section>`;}
  function draw(values={}){
    dialog.innerHTML=`<header class="support-heading"><h2 id="supportTitle">Signaler un problème</h2><button type="button" class="secondary-btn" data-support-close>Fermer</button></header>${!userId?'<p>Connecte-toi pour envoyer un signalement et suivre la réponse de Prepago.</p><a class="primary-btn" href="/connexion/">Se connecter</a>':`<form id="supportForm" class="support-form"><label for="supportKind">Type<select name="kind" id="supportKind">${Object.entries(kinds).filter(([k])=>k!=='technical').map(([k,l])=>`<option value="${k}" ${k===(values.kind||'problem')?'selected':''}>${l}</option>`).join('')}</select></label><label for="supportTitleInput">Sujet<input name="title" id="supportTitleInput" maxlength="100" minlength="3" required value="${esc(values.title||'')}" placeholder="Ex. Le corrigé ne s’ouvre pas"></label><label for="supportDetails">Description<textarea name="details" id="supportDetails" minlength="10" maxlength="2000" required placeholder="Que voulais-tu faire ? Que s’est-il passé ?">${esc(values.details||'')}</textarea></label><div class="support-actions"><button type="submit" class="primary-btn">Envoyer le signalement</button><button type="button" class="link-btn" data-support-history>Actualiser mes signalements</button></div></form><p id="supportStatus" class="support-status" role="status"></p><div id="supportHistory">${history()}</div>`}`;
  }
  async function open(values={}){reportContext={page:page(),context:core.context(values.context)};draw(values);if(!dialog.open)dialog.showModal();if(!userId)return;const g=generation;try{await loadOwn();if(g===generation&&dialog.open)dialog.querySelector('#supportHistory').innerHTML=history();}catch{if(g===generation)status('Impossible de charger les signalements. Réessaie après avoir vérifié ta connexion.',true);}}
  async function record(code){
    if(!client||!optedIn())return;
    const now=Date.now();if(now-(diagnosticTimes.get(code)||0)<900000)return;diagnosticTimes.set(code,now);
    try{await client.rpc('record_workspace_fault',{input_code:code,input_page:page()});}catch{}
  }
  function exportWorkspace(){
    if(!userId)return;
    const pending=core.draft(localStorage.getItem(`prepago-unsynced-${userId}`));
    const backup=core.backup(userId,pending||window.PrepagoState.snapshot());
    const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`prepago-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    window.showToast?.('Copie de ton espace téléchargée.');
  }
  async function restoreWorkspace(file){
    const g=generation,id=userId;
    if(!file||!id)return;
    try{
      if(file.size>5*1024*1024)throw Error('invalid_backup');
      const value=await file.text(),next=core.restore(value,id);if(g!==generation)return;
      if(!confirm('Restaurer cette copie sur ton compte ? Télécharge d’abord ton espace actuel si tu veux le conserver.'))return;
      await window.PrepagoSync.flush();if(g!==generation)return;
      await window.PrepagoSync.restore(next);if(g!==generation)return;window.showToast?.('Copie restaurée et synchronisée.');
    }catch{if(g===generation)window.showToast?.('Restauration impossible. Choisis une copie Prepago de ce compte et vérifie la synchronisation.');}
  }
  function accountControls(){
    if(!userId||!document.querySelector('#page .account-grid'))return;
    document.querySelector('#page').insertAdjacentHTML('beforeend',`<section class="activity-panel support-account-panel"><h2>Aide et copie de mon espace</h2><div class="support-actions"><button class="primary-btn" type="button" data-support-open>Signaler un problème</button><button class="secondary-btn" type="button" data-workspace-export>Exporter mes données</button><button class="link-btn" type="button" data-workspace-restore>Restaurer une copie</button></div><p class="support-helper">La copie contient ton espace personnel. La restauration conserve les sessions d’étude synchronisées avec le serveur.</p><input type="file" id="workspaceRestoreInput" accept="application/json,.json" hidden><label class="support-diagnostic-option"><input id="shareWorkspaceDiagnostics" type="checkbox" ${optedIn()?'checked':''}><span>Partager les erreurs techniques sur cet appareil<small>Uniquement la page et un code d’erreur. Tes notes, exercices et textes saisis ne sont pas transmis.</small></span></label></section>`);
  }
  const oldAccount=renderAccount;renderAccount=function(){oldAccount();accountControls();};
  const actions=document.querySelector('.topbar-actions');actions?.insertAdjacentHTML('beforeend','<button type="button" class="link-btn support-nav-button" data-support-open aria-label="Aide : signaler un problème"><span class="support-label-full">Signaler un problème</span><span class="support-label-short" aria-hidden="true">Aide</span></button>');
  document.querySelector('#accessGate')?.insertAdjacentHTML('beforeend','<button type="button" class="link-btn" data-support-open>Besoin d’aide ?</button>');
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-support-open]'))void open();
    const paper=e.target.closest('[data-support-paper]');if(paper)void open({kind:'content',title:`${paper.dataset.filiere} · ${paper.dataset.subject} · ${paper.dataset.year}`,context:paper.dataset});
    if(e.target.closest('[data-workspace-export]'))exportWorkspace();
    if(e.target.closest('[data-workspace-restore]'))document.querySelector('#workspaceRestoreInput')?.click();
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='shareWorkspaceDiagnostics'&&userId){try{localStorage.setItem(preferenceKey(),String(e.target.checked));}catch{}window.showToast?.(e.target.checked?'Partage des diagnostics activé.':'Partage des diagnostics désactivé.');}
    if(e.target.id==='workspaceRestoreInput')void restoreWorkspace(e.target.files?.[0]);
  });
  dialog.addEventListener('click',async e=>{
    if(e.target.closest('[data-support-close]')&&!busy)dialog.close();
    if(e.target.closest('[data-support-history]')){const g=generation;try{await loadOwn();if(g===generation)dialog.querySelector('#supportHistory').innerHTML=history();}catch{if(g===generation)status('Actualisation impossible.',true);}}
  });
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  dialog.addEventListener('submit',async e=>{
    if(e.target.id!=='supportForm')return;e.preventDefault();if(busy||!client||!userId)return;
    const g=generation,form=e.target,c=client;let submitted=false;busy=true;form.querySelector('button[type=submit]').disabled=true;
    try{
      const values=Object.fromEntries(new FormData(form)),payload=core.report({...values,...reportContext});
      status('Envoi…');const r=await c.rpc('submit_support_report',payload);if(r.error)throw r.error;if(g!==generation)return;submitted=true;
      form.reset();status(`Signalement reçu · référence ${String(r.data).slice(0,8)}. Tu retrouveras la réponse ici.`);
      await loadOwn();if(g===generation)dialog.querySelector('#supportHistory').innerHTML=history();
    }catch(err){if(g===generation)status(submitted?'Signalement reçu. L’historique ne peut pas être actualisé pour le moment.':err?.message==='invalid_report'?'Ajoute un sujet et une description d’au moins 10 caractères.':err?.code==='P0001'?'Tu as atteint la limite de 8 signalements par jour. Réessaie demain.':'Le signalement n’a pas été envoyé. Ton texte est conservé ; réessaie.',true);}
    finally{if(g===generation){busy=false;form.querySelector('button[type=submit]').disabled=false;}}
  });
  window.addEventListener('error',e=>{if(e instanceof ErrorEvent)void record('runtime_error');});
  window.addEventListener('unhandledrejection',()=>void record('unhandled_rejection'));
  async function adminReports(){if(!client||!admin)throw Error('admin_required');const g=generation;const r=await client.from('support_reports').select('*').order('created_at',{ascending:false}).limit(200);if(g!==generation)throw Error('account_changed');if(r.error)throw r.error;return r.data||[];}
  async function replyReport(row,values){if(!client||!admin)throw Error('admin_required');const r=await client.rpc('admin_reply_report',{report_id:row.id,new_status:values.status,new_reply:values.reply,expected_updated_at:row.updated_at});if(r.error)throw r.error;if(!r.data)throw Error('conflict');}
  window.PrepagoSupport={connect,clear,open,record,exportWorkspace,adminReports,replyReport,labels,kinds};
})();
