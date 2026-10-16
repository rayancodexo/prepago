(() => {
 function closeMenu(nav){nav.classList.remove('open');const button=nav.querySelector('.public-menu');button?.setAttribute('aria-expanded','false');button?.setAttribute('aria-label','Ouvrir le menu');if(button)button.textContent='☰'}
 document.querySelectorAll('.public-menu').forEach(button=>button.addEventListener('click',()=>{const nav=button.closest('.public-nav'),open=nav.classList.toggle('open');button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Fermer le menu':'Ouvrir le menu');button.textContent=open?'×':'☰'}));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){const nav=document.querySelector('.public-nav.open');if(nav){closeMenu(nav);nav.querySelector('.public-menu')?.focus()}}});
 document.querySelectorAll('.public-nav a').forEach(link=>link.addEventListener('click',()=>closeMenu(link.closest('.public-nav'))));
})();
