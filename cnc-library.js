// Shared catalogue is transient. Private notes, timers and scores stay in state.cnc.
(() => {
 const bucket='cnc-documents';
 let client=null,userId=null,admin=false,rows=[],loading=false,error='',generation=0,loaded=false;
 let editing=null,busy=false,showArchived=false,documentRequest=0;
 const dialog=document.createElement('dialog');dialog.className='cnc-admin-dialog';
 dialog.setAttribute('aria-labelledby','cncAdminTitle');document.body.append(dialog);
 function find(p){return rows.find(r=>!r.archived&&r.published&&r.filiere===p.filiere&&r.subject===p.subject&&r.year===Number(p.year))}
 function message(err){if(err?.code==='23505')return 'Cette édition existe déjà. Modifiez-la dans la liste.';if(err?.message==='conflict')return 'Cette annale a changé. Actualisez la liste avant de réessayer.';if(err?.message==='pdf')return 'Choisissez un PDF valide de 20 Mo maximum.';return 'Action impossible. Vérifiez votre connexion et vos droits, puis réessayez.'}
 function controls(){
  document.querySelectorAll('[data-cnc-manage]').forEach(n=>n.remove());
  if(!admin)return;
  const button='<button type="button" class="secondary-btn cnc-library-manage" data-cnc-manage>Gestion des annales</button>';
  document.querySelector('#accessGate')?.insertAdjacentHTML('beforeend',button);
  if(currentPage==='account')document.querySelector('#page .section-head')?.insertAdjacentHTML('beforeend',button);
 }
 async function load(){
  if(!client||loading)return;loading=true;error='';const g=generation,c=client;
  try{
   const role=await c.from('user_roles').select('role').eq('user_id',userId).maybeSingle();if(role.error)throw role.error;
   const result=await c.from('cnc_exams').select('*').order('year',{ascending:false}).limit(5000);
   if(result.error)throw result.error;if(g!==generation)return;
   admin=role.data?.role==='admin';rows=result.data||[];loaded=true;
  }catch(e){if(g===generation)error=message(e)}finally{
   if(g===generation){loading=false;controls();if(dialog.open)renderList();if(currentPage==='cnc')renderCnc()}
  }
 }
 function connect(c,id){generation++;client=c;userId=id;admin=false;rows=[];loaded=false;loading=false;error='';controls();void load()}
 function clear(){generation++;documentRequest++;client=null;userId=null;admin=false;rows=[];loaded=false;loading=false;error='';editing=null;dialog.close();controls()}
 async function pdfUrl(path){const result=await client.storage.from(bucket).createSignedUrl(path,900);if(result.error)throw result.error;return result.data.signedUrl}
 async function validatePdf(file){
  if(!file||file.size===0||file.size>20*1024*1024||!file.name.toLowerCase().endsWith('.pdf'))throw new Error('pdf');
  if(await file.slice(0,5).text()!=='%PDF-')throw new Error('pdf');
 }
 async function upload(file,id,c){await validatePdf(file);const path=`${id}/${crypto.randomUUID()}.pdf`;const r=await c.storage.from(bucket).upload(path,file,{contentType:'application/pdf',upsert:false});if(r.error)throw r.error;return path}
 function status(text){const n=dialog.querySelector('#cncAdminStatus');if(n)n.textContent=text}
 function fillSubjects(value){const select=dialog.querySelector('[name=subject]'),f=dialog.querySelector('[name=filiere]').value;select.innerHTML=CNC_SUBJECTS[f].map(s=>`<option ${s===value?'selected':''}>${esc(s)}</option>`).join('')}
 function editor(row=null){
  editing=row;const form=dialog.querySelector('#cncAdminForm');form.reset();
  form.elements.filiere.value=row?.filiere||'PSI';fillSubjects(row?.subject);
  form.elements.year.value=row?.year||new Date().getFullYear();
  ['filiere','subject','year'].forEach(k=>form.elements[k].disabled=!!row);
  form.elements.subject_pdf.required=!row;
  dialog.querySelector('#cncEditorTitle').textContent=row?'Modifier cette annale':'Ajouter une annale';
  dialog.querySelector('#cncExistingFiles').textContent=row?`${row.filiere} · ${row.subject} · ${row.year}. Un nouveau fichier remplace le précédent sans modifier les notes des étudiants.`:'PDF uniquement · 20 Mo maximum par fichier.';
  dialog.querySelector('#cncRemoveCorrection').hidden=!(row?.correction_path||row?.correction_url);
  status('');
 }
 function renderList(){
  const target=dialog.querySelector('#cncAdminList');if(!target)return;
  const list=rows.filter(r=>r.archived===showArchived);
  target.innerHTML=error?`<p role="alert">${esc(error)}</p>`:loading?'<p>Chargement…</p>':list.length?list.map(r=>`<article class="cnc-admin-entry"><strong>${esc(r.filiere)} · ${esc(r.subject)} · ${r.year}</strong><p>${r.archived?'Archivée':r.published?'Publiée · visible aux étudiants avec accès':'Brouillon · visible uniquement aux administrateurs'}${(r.correction_path||r.correction_url)?' · Corrigé inclus':''}</p><div class="cnc-admin-actions">${!r.archived?`<button type="button" class="secondary-btn" data-cnc-edit="${r.id}">Modifier</button><button type="button" class="secondary-btn" data-cnc-publish="${r.id}">${r.published?'Dépublier':'Publier'}</button><button type="button" class="link-btn" data-cnc-archive="${r.id}">Archiver</button>`:`<button type="button" class="secondary-btn" data-cnc-restore="${r.id}">Restaurer en brouillon</button>`}</div></article>`).join(''):'<p>Aucune annale ici. Ajoutez votre premier PDF avec le formulaire.</p>';
  target.querySelectorAll('button').forEach(b=>b.disabled=busy);
 }
 function open(){
  if(!admin)return;dialog.innerHTML=`<header class="cnc-admin-head"><div><h2 id="cncAdminTitle">Gestion des annales</h2><p>Publiez une fois, partagez avec tous vos étudiants.</p></div><button type="button" class="secondary-btn" data-cnc-close>Fermer</button></header><div class="cnc-admin-body"><section><h3 id="cncEditorTitle">Ajouter une annale</h3><form id="cncAdminForm"><div class="field"><label for="cncAdminFiliere">Filière</label><select id="cncAdminFiliere" name="filiere">${Object.keys(CNC_SUBJECTS).map(f=>`<option>${f}</option>`).join('')}</select></div><div class="field"><label for="cncAdminSubject">Matière</label><select id="cncAdminSubject" name="subject"></select></div><div class="field"><label for="cncAdminYear">Année</label><input id="cncAdminYear" name="year" type="number" min="1990" max="2100" required></div><p id="cncExistingFiles" class="cnc-pdf-caption"></p><div class="field"><label for="cncSubjectFile">Sujet PDF</label><input id="cncSubjectFile" name="subject_pdf" type="file" accept="application/pdf,.pdf"></div><div class="field"><label for="cncCorrectionFile">Corrigé PDF (facultatif)</label><input id="cncCorrectionFile" name="correction_pdf" type="file" accept="application/pdf,.pdf"></div><label id="cncRemoveCorrection" hidden><input type="checkbox" name="remove_correction"> Retirer le corrigé actuel</label><div class="cnc-admin-actions"><button type="submit" class="primary-btn" value="publish">Publier pour les étudiants</button><button type="submit" class="secondary-btn" value="draft">Enregistrer en brouillon</button><button type="button" class="link-btn" data-cnc-new>Nouvelle annale</button></div><p id="cncAdminStatus" class="cnc-admin-status" role="status"></p></form></section><section><div class="cnc-admin-actions"><h3>Bibliothèque</h3><button type="button" class="link-btn" data-cnc-refresh>Actualiser</button></div><label><input type="checkbox" id="cncShowArchived" ${showArchived?'checked':''}> Voir les archives</label><div id="cncAdminList"></div></section></div>`;
  editor();renderList();dialog.showModal();
 }
 function setBusy(value){busy=value;dialog.querySelectorAll('button').forEach(b=>b.disabled=value);dialog.querySelectorAll('input,select').forEach(n=>{n.disabled=value||!!editing&&['filiere','subject','year'].includes(n.name)})}
 async function updateRow(row,values,c=client){const r=await c.from('cnc_exams').update(values).eq('id',row.id).eq('updated_at',row.updated_at).select('id');if(r.error)throw r.error;if(!r.data?.length)throw new Error('conflict')}
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
 dialog.addEventListener('change',e=>{if(e.target.name==='filiere')fillSubjects();if(e.target.id==='cncShowArchived'){showArchived=e.target.checked;renderList()}});
 dialog.addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!admin)return;const form=e.target,c=client,g=generation,row=editing;
  const subjectFile=form.elements.subject_pdf.files[0],correctionFile=form.elements.correction_pdf.files[0];
  const values={filiere:form.elements.filiere.value,subject:form.elements.subject.value,year:Number(form.elements.year.value),published:e.submitter?.value==='publish'};
  const removeCorrection=form.elements.remove_correction.checked;
  setBusy(true);status('Vérification des fichiers…');
  try{
   if(!row&&!subjectFile)throw new Error('pdf');
   if(subjectFile)await validatePdf(subjectFile);if(correctionFile)await validatePdf(correctionFile);
   const id=row?.id||crypto.randomUUID();status('Envoi des fichiers… Gardez cette fenêtre ouverte.');
   values.subject_path=subjectFile?await upload(subjectFile,id,c):row.subject_path;
   values.subject_url=subjectFile?null:row?.subject_url||null;
   values.correction_path=correctionFile?await upload(correctionFile,id,c):removeCorrection?null:row?.correction_path||null;
   values.correction_url=(correctionFile||removeCorrection)?null:row?.correction_url||null;
   if(!values.subject_url&&!values.correction_url){values.source_url=null;values.source_label=null}
   else if(values.subject_path&&values.correction_url&&row?.source_url){values.source_label=`${row.source_label?.replace(/ · corrigé$/,'')||'Source'} · corrigé`}
   if(g!==generation)return;status('Enregistrement…');
   if(row)await updateRow(row,values,c);else {const r=await c.from('cnc_exams').insert({id,...values});if(r.error)throw r.error}
   if(g!==generation)return;await load();editor();status(values.published?'Annale publiée. Les étudiants la verront dans Annales CNC.':'Brouillon enregistré. Il reste privé.');
  }catch(err){if(g===generation)status(message(err))}finally{busy=false;if(g===generation)setBusy(false)}
 });
 dialog.addEventListener('click',async e=>{
  if(busy)return;
  if(e.target.closest('[data-cnc-close]'))dialog.close();
  if(e.target.closest('[data-cnc-new]'))editor();
  const edit=e.target.closest('[data-cnc-edit]');if(edit)editor(rows.find(r=>r.id===edit.dataset.cncEdit));
  const action=e.target.closest('[data-cnc-publish],[data-cnc-archive],[data-cnc-restore]');if(!action||!admin)return;
  const id=action.dataset.cncPublish||action.dataset.cncArchive||action.dataset.cncRestore,row=rows.find(r=>r.id===id);if(!row)return;
  if(action.hasAttribute('data-cnc-archive')&&!confirm('Archiver cette annale ? Elle ne sera plus visible aux étudiants. Leurs notes et résultats seront conservés.'))return;
  const values=action.hasAttribute('data-cnc-publish')?{published:!row.published}:action.hasAttribute('data-cnc-restore')?{archived:false,published:false}:{archived:true,published:false};
  const g=generation;setBusy(true);
  try{await updateRow(row,values);if(g!==generation)return;await load();if(editing?.id===id)editor();status('Bibliothèque mise à jour.')}catch(err){if(g===generation)status(message(err))}finally{busy=false;if(g===generation)setBusy(false)}
 });
 document.addEventListener('click',e=>{if(e.target.closest('[data-cnc-manage]'))open();if(e.target.closest('[data-cnc-refresh]'))void load()});
 const renderCncBase=renderCnc;
 renderCnc=function(){
  renderCncBase();const shell=document.querySelector('.cnc-shell');
  // The privacy line belongs to the first screen; inside a filière it only shows while loading or on error.
  const settled=loaded&&!loading&&!error;
  if(!settled||cncView.screen==='filieres')shell.insertAdjacentHTML('afterbegin',`<div class="cnc-library-note${settled?'':' is-status'}"><span role="status">${error?esc(error):loading?'Chargement de la bibliothèque…':loaded?'Les sujets publiés sont partagés. Vos notes et résultats restent privés.':'Bibliothèque en attente de connexion.'}</span><div><button type="button" class="link-btn" data-cnc-refresh ${loading?'disabled':''}>Actualiser</button>${admin?'<button type="button" class="secondary-btn" data-cnc-manage>Gestion des annales</button>':''}</div></div>`);
  if(cncView.screen!=='paper')return;
  const p=getPaper(cncView.filiere,cncView.subject,cncView.year),record=find(p);if(!record)return;
  const viewer=shell.querySelector('.paper-viewer'),request=++documentRequest,g=generation;
  viewer.innerHTML=`<div class="paper-toolbar"><h2>${cncContest(p.filiere)} ${esc(p.subject)} · ${p.year}</h2><span class="tag">Bibliothèque Prepago</span></div><div class="cnc-pdf-status" role="status">Chargement du PDF…</div>`;
  window.PrepagoCncDocuments.resolve(record,pdfUrl).then(({subjectUrl,correctionUrl,previewUrl,sourceUrl,sourceLabel,external})=>{
   if(g!==generation||request!==documentRequest||!viewer.isConnected)return;
   viewer.innerHTML=`<div class="paper-toolbar"><h2>${cncContest(p.filiere)} ${esc(p.subject)} · ${p.year}</h2><span class="tag">Bibliothèque Prepago</span></div><div class="cnc-pdf-actions"><a class="primary-btn" href="${esc(subjectUrl)}" target="_blank" rel="noopener noreferrer">Ouvrir le sujet PDF</a>${correctionUrl?`<a class="secondary-btn" href="${esc(correctionUrl)}" target="_blank" rel="noopener noreferrer">Ouvrir le corrigé PDF</a>`:'<span class="helper">Corrigé non disponible pour cette édition.</span>'}<button type="button" class="link-btn" data-support-paper data-filiere="${esc(p.filiere)}" data-subject="${esc(p.subject)}" data-year="${p.year}">Signaler ce document</button></div><p class="cnc-pdf-caption">${sourceUrl?`Source : <a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(sourceLabel)}</a>. `:''}${external?'Documents hébergés par la source. ':''}Si l’aperçu ne s’affiche pas, utilisez « Ouvrir le sujet PDF ».</p><iframe class="paper-frame" src="${esc(previewUrl)}" title="Sujet ${cncContest(p.filiere)} ${esc(p.subject)} ${p.year}"></iframe>`;
  }).catch(()=>{if(g===generation&&viewer.isConnected)viewer.querySelector('.cnc-pdf-status').innerHTML='Impossible de charger le document. <button class="link-btn" data-cnc-refresh>Réessayer</button>'});
 };
 const renderAccountBase=renderAccount;
 renderAccount=function(){renderAccountBase();controls()};
 window.PrepagoCncLibrary={connect,clear,find,open,refresh:load,years:(f,s)=>rows.filter(r=>!r.archived&&r.published&&r.filiere===f&&(!s||r.subject===s)).map(r=>r.year)};
})();
