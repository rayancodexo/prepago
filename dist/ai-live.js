/* Sends only the explicitly submitted text, never the student's workspace or files. */
(function () {
  'use strict';
  let client=null,userId=null,generation=0,status=null,busy=false;
  const escape=value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const messages={authentication_required:'Reconnecte-toi pour utiliser le tuteur.',
    subscription_required:'Un accès Prepago AI+ valide est nécessaire.',not_configured:'Le tuteur est en cours d’activation.',
    invalid_question:'Saisis un énoncé de 10 à 5 000 caractères et choisis le type d’aide.',
    invalid_context:'Choisis une matière et un chapitre de ton programme.',daily_limit:'Tes 10 demandes du jour ont été utilisées. Reviens demain.',
    service_limit:'La limite du service est atteinte pour aujourd’hui. Reviens demain.',rate_limit:'Attends 20 secondes entre deux demandes.',
    duplicate_request:'Cette demande a déjà été reçue. Elle ne sera pas envoyée deux fois.',
    service_unavailable:'Le tuteur est momentanément indisponible. Une demande reçue peut déjà compter dans ton quota.'};

  function repaint() {if(currentPage === 'ai' && !document.body.classList.contains('auth-pending'))render();}
  function clear() {
    generation++;client=null;userId=null;status=null;busy=false;
    const dialog=document.querySelector('#aiLiveDialog');dialog?.close();dialog?.remove();
  }
  async function invoke(body) {
    const result=await client.functions.invoke('prepago-ai-tutor',{body});
    if(result.error){
      let code=result.data?.code;
      try{code ||= (await result.error.context?.json())?.code;}catch{/* Do not display server internals. */}
      throw new Error(messages[code] || 'Connexion au tuteur impossible. Vérifie ta connexion.');
    }
    return result.data;
  }
  async function connect(nextClient,nextUser) {
    clear();client=nextClient;userId=nextUser;
    if(!window.PrepagoAICore.hasWorkspaceAccess(window.PrepagoAccount))return;
    const request=generation;
    try{const next=await invoke({action:'status'});if(request!==generation)return;status=next;}
    catch{if(request!==generation)return;status={enabled:false,unavailable:true};}
    repaint();
  }
  function markup() {
    if(!client || !window.PrepagoAICore.hasWorkspaceAccess(window.PrepagoAccount))return '';
    if(status?.enabled)return `<aside class="ai-live-banner"><div><strong>Tuteur IA · énoncé texte</strong><span>${Math.max(0,status.daily_limit-status.used_today)} demandes restantes aujourd’hui · renouvellement à minuit UTC</span></div><button type="button" class="primary-btn" data-ai-live-open>Poser une question</button></aside>`;
    return `<aside class="ai-live-banner"><div><strong>${status?.unavailable?'Connexion au tuteur indisponible':status?'Tuteur en cours d’activation':'Vérification du tuteur…'}</strong><span>L’exemple guidé reste disponible. Les photos et PDF restent dans ton navigateur.</span></div></aside>`;
  }
  function options(items,placeholder) {return `<option value="">${placeholder}</option>`+items.map(item=>`<option value="${escape(item.id)}">${escape(item.name)}</option>`).join('');}
  function subjects() {return (state.subjects || []).filter(subject=>subject.curriculumKey && subject.chapters.some(chapter=>chapter.curriculumId));}
  function chapters(form) {
    const subject=subjects().find(item=>item.id===form.elements.subject.value);
    const items=(subject?.chapters || []).filter(chapter=>chapter.curriculumId && chapter.studyLevel===form.elements.level.value);
    form.elements.chapter.innerHTML=options(items,'Choisir un chapitre');
    form.elements.chapter.disabled=!items.length;
  }
  function open() {
    if(!status?.enabled || !userId || !window.PrepagoAICore.hasWorkspaceAccess(window.PrepagoAccount))return;
    const existing=document.querySelector('#aiLiveDialog');
    if(existing){if(!existing.open)existing.showModal();return;}
    const dialog=document.createElement('dialog');dialog.id='aiLiveDialog';dialog.className='prepago-support-dialog ai-live-dialog';
    dialog.setAttribute('aria-labelledby','aiLiveTitle');
    dialog.innerHTML=`<header class="support-heading"><div><span class="support-kicker">Prepago AI+</span><h2 id="aiLiveTitle">Un indice pour avancer</h2></div><button type="button" class="icon-btn" data-ai-live-close aria-label="Fermer">×</button></header>
      <form id="aiLiveForm"><div class="ai-live-context"><label>Année<select name="level" required><option value="sup">Sup</option><option value="spe">Spé</option></select></label>
      <label>Matière<select name="subject" required>${options(subjects(),'Choisir une matière')}</select></label>
      <label>Chapitre<select name="chapter" required disabled><option value="">Choisir une matière</option></select></label>
      <label>Aide souhaitée<select name="mode"><option value="hint">Un premier indice</option><option value="explanation">Expliquer la méthode</option><option value="correction">Correction expliquée</option></select></label></div>
      <label for="aiLiveQuestion">Ton énoncé et ta question</label><textarea id="aiLiveQuestion" name="question" rows="7" minlength="10" maxlength="5000" required placeholder="Copie l’énoncé complet, puis précise ce qui te bloque…"></textarea>
      <label class="support-check"><input type="checkbox" name="consent" required> Envoyer cet énoncé à OpenAI pour obtenir une réponse. Mes notes et mes fichiers restent dans mon espace.</label>
      <p class="support-helper">${Math.max(0,status.daily_limit-status.used_today)} demandes restantes. Vérifie les résultats avec ton cours : le tuteur peut faire des erreurs.</p>
      <button type="submit" class="primary-btn">Demander de l’aide</button><p id="aiLiveStatus" role="status"></p></form>
      <section id="aiLiveAnswer" class="ai-live-answer" aria-live="polite" hidden></section>`;
    dialog.addEventListener('cancel',event=>{if(busy){event.preventDefault();return;}dialog.close();});
    document.body.append(dialog);dialog.showModal();dialog.querySelector('select')?.focus();
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-ai-live-open]'))open();
    if(event.target.closest('[data-ai-live-close]'))document.querySelector('#aiLiveDialog')?.close();
  });
  document.addEventListener('change',event=>{if(event.target.closest('#aiLiveForm') && ['level','subject'].includes(event.target.name))chapters(event.target.form);});
  document.addEventListener('submit',async event=>{
    if(event.target.id!=='aiLiveForm')return;event.preventDefault();
    const form=event.target;
    if(busy || !client || !userId || !status?.enabled || !window.PrepagoAICore.hasWorkspaceAccess(window.PrepagoAccount) || !form.reportValidity())return;
    const subject=subjects().find(item=>item.id===form.elements.subject.value);
    const chapter=subject?.chapters.find(item=>item.id===form.elements.chapter.value && item.studyLevel===form.elements.level.value);
    if(!chapter?.curriculumId)return;
    const request=generation,button=form.querySelector('[type="submit"]'),notice=document.querySelector('#aiLiveStatus'),answer=document.querySelector('#aiLiveAnswer');
    const body={request_id:crypto.randomUUID(),question:form.elements.question.value,mode:form.elements.mode.value,
      level:form.elements.level.value,subject:subject.curriculumKey,chapter:chapter.curriculumId};
    const controls=Array.from(form.querySelectorAll('input,select,textarea,button'));
    const disabledBefore=controls.map(control=>control.disabled);
    busy=true;controls.forEach(control=>control.disabled=true);notice.textContent='Le tuteur prépare sa réponse…';answer.hidden=true;
    try{
      const result=await invoke(body);if(request!==generation)return;
      status={...status,used_today:result.used_today,daily_limit:result.daily_limit};
      let reference='';
      try{const url=new URL(result.reference?.url);if(url.protocol==='https:' && url.hostname==='www.cpge.ac.ma')reference=`<p class="support-helper">Programme associé : <a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${escape(result.reference.label)} ↗</a></p>`;}catch{/* No arbitrary links. */}
      answer.innerHTML=`<h3>La réponse du tuteur</h3><div class="ai-live-text">${escape(result.answer)}</div>${result.incomplete?'<p>La réponse a atteint sa limite de longueur.</p>':''}${reference}`;
      answer.hidden=false;notice.textContent=`${Math.max(0,status.daily_limit-status.used_today)} demandes restantes aujourd’hui.`;
    }catch(error){if(request===generation){notice.textContent=error.message;void window.PrepagoSupport?.record('ai_request_failed','ai');}}
    finally{if(request===generation){busy=false;controls.forEach((control,index)=>control.disabled=disabledBefore[index]);}}
  });
  window.addEventListener('pagehide',clear);
  window.PrepagoAILive=Object.freeze({connect,clear,markup});
})();
