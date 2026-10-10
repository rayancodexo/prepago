/* Admin controls use database-verified roles; students cannot manage codes. */
(() => {
  let client=null,userId=null,isAdmin=false,rows=[],busy=false,generation=0;
  const dialog=document.createElement('dialog');dialog.className='cnc-admin-dialog promo-admin-dialog';dialog.setAttribute('aria-labelledby','promoAdminTitle');document.body.append(dialog);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>value?new Intl.DateTimeFormat('fr-FR',{dateStyle:'short'}).format(new Date(value)):'Sans expiration';
  function controls(){
    document.querySelectorAll('[data-promo-manage]').forEach(n=>n.remove());
    if(!isAdmin)return;
    const markup='<button type="button" class="secondary-btn promo-manage" data-promo-manage>Gérer les codes promo</button>';
    document.querySelector('#accessGate')?.insertAdjacentHTML('beforeend',markup);
    document.querySelector('#page .account-grid')?.insertAdjacentHTML('afterbegin',markup);
  }
  function clear(){generation++;client=null;userId=null;isAdmin=false;rows=[];busy=false;dialog.close();controls()}
  function connect(c,id,admin){clear();client=c;userId=id;isAdmin=admin;controls()}
  function message(error){return error?.code==='23505'?'Ce code existe déjà. Choisis un autre nom.':error?.code==='42501'?'Cette action est réservée aux administrateurs.':error?.code==='22023'?error.message:'Impossible d’enregistrer. Vérifie ta connexion et réessaie.'}
  function editor(row=null){
    const form=dialog.querySelector('form');form.reset();form.dataset.id=row?.id||'';
    form.elements.code.value=row?.code||'';form.elements.duration_days.value=row?.duration_days||30;
    form.elements.max_uses.value=row?.max_uses||'';form.elements.active.checked=row?.active??true;
    form.elements.expires_at.value=row?.expires_at?new Date(new Date(row.expires_at).getTime()-new Date(row.expires_at).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
    form.elements.code.readOnly=!!row;dialog.querySelector('#promoEditorTitle').textContent=row?'Modifier le code':'Créer un code';
    dialog.querySelector('#promoAdminStatus').textContent='';
  }
  async function load(){
    const g=generation,c=client;const {data,error}=await c.from('promo_codes').select('id,code,duration_days,max_uses,used_count,active,expires_at,created_at').order('created_at',{ascending:false});
    if(g!==generation)return false;if(error)throw error;rows=data||[];renderList();return true;
  }
  function renderList(){
    dialog.querySelector('#promoAdminList').innerHTML=rows.length?rows.map(row=>`<article class="cnc-admin-entry"><div class="promo-row-head"><strong>${escape(row.code)}</strong><span>${row.active?'Activé':'Désactivé'}</span></div><p>${row.duration_days} jours d’accès · ${row.used_count}${row.max_uses?' / '+row.max_uses:''} utilisation${row.used_count>1?'s':''} · ${escape(date(row.expires_at))}</p><button class="secondary-btn" type="button" data-promo-edit="${row.id}">Modifier</button></article>`).join(''):'<p>Aucun code promo.</p>';
  }
  async function open(){
    if(!isAdmin||!client)return;
    dialog.innerHTML=`<header class="cnc-admin-head"><div><h2 id="promoAdminTitle">Codes promo</h2><p>Chaque code peut être utilisé une fois par compte.</p></div><button type="button" class="secondary-btn" data-promo-close>Fermer</button></header><div class="cnc-admin-body"><section><h3 id="promoEditorTitle">Créer un code</h3><form><div class="field"><label for="adminPromoCode">Code</label><input id="adminPromoCode" name="code" maxlength="64" pattern="[A-Za-z0-9_-]{3,64}" placeholder="CODE-EXEMPLE" autocomplete="off" required></div><div class="field"><label for="adminPromoDuration">Durée de l’accès (jours)</label><input id="adminPromoDuration" name="duration_days" type="number" min="1" max="3650" value="30" required></div><div class="field"><label for="adminPromoLimit">Nombre d’utilisations maximum</label><input id="adminPromoLimit" name="max_uses" type="number" min="1" placeholder="Illimité si vide"></div><div class="field"><label for="adminPromoExpiry">Expiration du code (facultatif)</label><input id="adminPromoExpiry" name="expires_at" type="datetime-local"></div><label><input name="active" type="checkbox" checked> Code activé</label><p class="helper">La désactivation empêche les nouvelles utilisations. Les accès déjà accordés sont conservés.</p><div class="cnc-admin-actions"><button type="submit" class="primary-btn">Enregistrer</button><button type="button" class="secondary-btn" data-promo-new>Nouveau code</button></div><p id="promoAdminStatus" role="status"></p></form></section><section><h3>Codes existants</h3><div id="promoAdminList">Chargement…</div></section></div>`;
    editor();dialog.showModal();try{await load()}catch(error){dialog.querySelector('#promoAdminStatus').textContent=message(error)}
  }
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
  dialog.addEventListener('click',e=>{if(busy)return;if(e.target.closest('[data-promo-close]'))dialog.close();if(e.target.closest('[data-promo-new]'))editor();const button=e.target.closest('[data-promo-edit]');if(button)editor(rows.find(row=>row.id===button.dataset.promoEdit))});
  dialog.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!isAdmin||!client)return;
    const form=event.target,status=dialog.querySelector('#promoAdminStatus'),g=generation,c=client;
    const values=Object.fromEntries(new FormData(form));
    busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='Enregistrement…';
    try{
      const {error}=await c.rpc('admin_save_promo_code',{promo_id:form.dataset.id||null,input_code:values.code.trim().toUpperCase(),input_duration_days:Number(values.duration_days),input_max_uses:values.max_uses?Number(values.max_uses):null,input_expires_at:values.expires_at?new Date(values.expires_at).toISOString():null,input_active:form.elements.active.checked});
      if(error)throw error;if(g!==generation)return;await load();editor();status.textContent='Code enregistré.';
    }catch(error){if(g===generation)status.textContent=message(error)}finally{if(g===generation){busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false)}}
  });
  document.addEventListener('click',event=>{if(event.target.closest('[data-promo-manage]'))void open()});
  window.PrepagoPromos={connect,clear,controls,open};
})();
