(function(){
  const y = document.getElementById('y');
  if (y) y.textContent = new Date().getFullYear();
  const bgMobile = document.body?.dataset?.bgMobile;
  if (bgMobile && window.matchMedia('(max-width: 680px)').matches) {
    document.body.style.background = `url('${bgMobile}') center/cover fixed, linear-gradient(180deg,#0a0a0c,#111113)`;
  }
  const fab = document.getElementById('mcFab');
  const sheet = document.getElementById('mcSheet');
  const closeBtn = document.getElementById('mcClose');
  if(fab && sheet && closeBtn){
    const open = () => { sheet.classList.add('show'); fab.setAttribute('aria-expanded','true'); sheet.setAttribute('aria-hidden','false'); };
    const close = () => { sheet.classList.remove('show'); fab.setAttribute('aria-expanded','false'); sheet.setAttribute('aria-hidden','true'); };
    fab.addEventListener('click', () => sheet.classList.contains('show') ? close() : open());
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', e => { if(e.key === 'Escape') close(); });
  }
})();
