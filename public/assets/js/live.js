/* Utils */
const $ = s => document.querySelector(s);
const el = h => {const d=document.createElement('div'); d.innerHTML=h.trim(); return d.firstChild;}
document.getElementById('y').textContent = new Date().getFullYear();
document.getElementById('dateLine').textContent =
  new Date().toLocaleDateString('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});

/* Slider */
(function initSlider(){
  const track = document.getElementById('track');
  const slider = document.getElementById('slider');
  const slides = track.children.length;
  let idx = 0, timer=null, startX=0, deltaX=0;
  const dots = document.getElementById('dots');
  for(let i=0;i<slides;i++){
    const dot=document.createElement('div'); dot.className='dot'+(i===0?' active':'');
    dot.addEventListener('click', ()=>go(i,true));
    dots.appendChild(dot);
  }
  const setDots = ()=>[...dots.children].forEach((d,i)=>d.classList.toggle('active', i===idx));
  const go = (n,hold=false)=>{ idx=(n+slides)%slides; track.style.transform=`translateX(-${idx*100}%)`; setDots(); if(hold) reset(); };
  const next=()=>go(idx+1), prev=()=>go(idx-1);
  const reset=()=>{ if(timer) clearInterval(timer); timer=setInterval(next, 3500); };
  document.getElementById('next').onclick = ()=>go(idx+1,true);
  document.getElementById('prev').onclick = ()=>go(idx-1,true);
  slider.addEventListener('mouseenter', ()=>timer&&clearInterval(timer));
  slider.addEventListener('mouseleave', reset);
  slider.addEventListener('touchstart', e=>{startX=e.touches[0].clientX; deltaX=0; if(timer) clearInterval(timer);});
  slider.addEventListener('touchmove', e=>{deltaX = e.touches[0].clientX - startX;});
  slider.addEventListener('touchend', ()=>{ if(Math.abs(deltaX)>40){ deltaX>0?prev():next(); } reset(); });
  reset();
})();

/* ===== FILTER pencarian (live + upcoming + FT) ===== */
function applyFilter(){
  const q = ($('#q').value||'').trim().toLowerCase();

  // live
  document.querySelectorAll('.match-card').forEach(card=>{
    const row = (card.getAttribute('data-row')||'').toLowerCase();
    card.style.display = !q || row.includes(q) ? '' : 'none';
  });
  document.querySelectorAll('.lg').forEach(g=>{
    const any = !!g.querySelector('.match-card:not([style*="display: none"])');
    g.style.display = any ? '' : 'none';
  });

  // upcoming
  document.querySelectorAll('.up-card').forEach(card=>{
    const row = (card.getAttribute('data-row')||'').toLowerCase();
    card.style.display = !q || row.includes(q) ? '' : 'none';
  });
  document.querySelectorAll('.up-group').forEach(g=>{
    const any = !!g.querySelector('.up-card:not([style*="display: none"])');
    g.style.display = any ? '' : 'none';
  });

  // FT
  document.querySelectorAll('#ftBody tr[data-row]').forEach(tr=>{
    const row = tr.getAttribute('data-row') || '';
    tr.style.display = !q || row.includes(q) ? '' : 'none';
  });
}
$('#q').addEventListener('input', applyFilter);

/* Helper kecil */
function leagueCell(r){const f=r.flag?`<img class="flag" src="${r.flag}" alt="" loading="lazy">`:'';return `${f}${r.league}`;}
function parseTeams(match=''){const [home='', away='']=match.split(' vs ');return {home, away};}
function stageClass(t=''){const s=t.toLowerCase();if(s.includes('ft'))return'is-ft';if(s.includes('ht'))return'is-ht';if(/\d/.test(s))return'is-live';return'';}
function splitKickoff(str=''){const m=(str||'').match(/(\d{2}\/\d{2}).*?(\d{2}[:.]\d{2})/);return {d:m?.[1]||'-',t:(m?.[2]||'-').replace('.',':')};}
function fmtEta(mins){mins=Math.max(0,Math.round(mins));const h=Math.floor(mins/60);const m=mins%60;return h?`${h}j ${m}m`:`${m}m`;}

/* ===== LIVE ===== */
async function fetchLive(){const r=await fetch('/api/live');if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
async function loadLive(){
  const loader=$('#loader'); loader.classList.add('show');
  try{
    const data = await fetchLive();
    const rows = data.rows || [];
    const groups = {};
    rows.forEach(r=>{const key=`${r.league}__${r.flag||''}`;(groups[key] ||= {title:r.league, flag:r.flag, items:[]}).items.push(r);});
    const html = Object.values(groups).map(g=>{
      const head=`<div class="lg-head">${g.flag?`<img class="flag" src="${g.flag}" alt="">`:``}<span class="lname">${g.title}</span></div>`;
      const body=g.items.map(r=>{const {home,away}=parseTeams(r.match||'');const klass=stageClass(r.time||'');return `
        <div class="match-card ${klass}" data-row="${(r.league+' '+r.match).toLowerCase()}">
          <div class="m-left"><div class="stage">${(r.time||'').toUpperCase()}</div><div class="minute mini muted">Live</div></div>
          <div class="m-mid"><div class="team"><span>${home}</span></div><div class="team"><span>${away}</span></div></div>
          <div class="m-right">${r.score||'-'}</div>
          <div class="m-cta"><button class="pill" onclick="openMatch(${r.id})">Lihat Data</button></div>
        </div>`;}).join('');
      return `<div class="lg">${head}<div class="lg-body">${body||`<div class="muted mini" style="padding:8px 12px">Belum ada pertandingan.</div>`}</div></div>`;
    }).join('');
    $('#liveList').innerHTML = html || `<div class="muted" style="padding:12px">Belum ada pertandingan live.</div>`;
    applyFilter();
  }catch{ $('#liveList').innerHTML = `<div class="muted" style="padding:12px">Gagal memuat live score.</div>`; }
  finally{ loader.classList.remove('show'); }
}
loadLive();
setInterval(loadLive, 60000);

/* ===== UPCOMING (NEXT) ===== */
async function fetchUpcoming(h){const r=await fetch('/api/upcoming?hours='+h);if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
function renderUpcoming(data){
  const rows = data.rows || [];
  const groups={};
  rows.forEach(r=>{const key=`${r.league}__${r.flag||''}`;(groups[key] ||= {title:r.league, flag:r.flag, items:[]}).items.push(r);});
  const html = Object.values(groups).map(g=>{
    const head = `<div class="up-head">${g.flag?`<img class="flag" src="${g.flag}" alt="">`:``}<span>${g.title}</span></div>`;
    const body = g.items.map(r=>{
      const {home,away}=parseTeams(r.match||'');
      const {d,t}=splitKickoff(r.kickoff||'');
      const now = Date.now();
      return `
        <div class="up-card" data-row="${(r.league+' '+r.match).toLowerCase()}" data-created="${now}" data-eta="${r.in}">
          <div class="kick">
            <div class="clock"><div class="t-big">${t}</div><div class="t-sub">${d}</div></div>
            <div class="eta">in ${fmtEta(r.in)}</div>
          </div>
          <div class="up-mid">
            <div class="team"><span>${home}</span></div>
            <div class="team"><span>${away}</span></div>
          </div>
          <div class="up-right"><button class="pill" onclick="openMatch(${r.id})">Detail</button></div>
        </div>`;
    }).join('');
    return `<div class="up-group">${head}<div class="up-body">${body||`<div class="muted mini" style="padding:8px 12px">Tidak ada jadwal dalam rentang ini.</div>`}</div></div>`;
  }).join('');
  $('#upcomingList').innerHTML = html || `<div class="muted" style="padding:8px 12px">Tidak ada jadwal dalam rentang ini.</div>`;
  applyFilter();
}
async function loadUpcoming(hours=2){
  try{ const d = await fetchUpcoming(hours); renderUpcoming(d); }
  catch{ $('#upcomingList').innerHTML=`<div class="muted" style="padding:8px 12px">Gagal memuat jadwal.</div>`; }
}
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on');
    loadUpcoming(btn.dataset.h || 2);
  });
});
function tickEta(){
  const now = Date.now();
  document.querySelectorAll('.up-card').forEach(card=>{
    const created = Number(card.getAttribute('data-created')||now);
    const base = Number(card.getAttribute('data-eta')||0);
    const gone = Math.round((now - created)/60000);
    const left = Math.max(0, base - gone);
    const el = card.querySelector('.eta');
    if (el) el.textContent = 'in ' + fmtEta(left);
  });
}
loadUpcoming(2);
setInterval(()=>{ loadUpcoming(document.querySelector('.tab-btn.on')?.dataset.h||2); }, 120000);
setInterval(tickEta, 30000);

/* ===== FT ===== */
async function fetchFinished(){const r=await fetch('/api/finished');if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
async function loadFinished(){
  try{
    const data = await fetchFinished();
    const rows = (data.rows||[]).map(r => `
      <tr data-row="${(r.league+' '+r.match).toLowerCase()}">
        <td>${leagueCell(r)}</td>
        <td>${r.match}</td>
        <td class="score">${r.score}</td>
        <td>${r.status || 'FT'}</td>
      </tr>`).join('');
    $('#ftBody').innerHTML = rows || `<tr><td colspan="4" class="muted">Belum ada yang selesai hari ini.</td></tr>`;
    applyFilter();
  }catch{ $('#ftBody').innerHTML = `<tr><td colspan="4" class="muted">Gagal memuat hasil akhir.</td></tr>`; }
}
loadFinished();

/* ===== MODAL controls ===== */
const modal = $('#modal');
const modalBody = $('#modalBody');
const modalClose = $('#modalClose');
function showModal(html){
  modalBody.innerHTML = html;
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
  setTimeout(()=>modalClose?.focus(), 50);
}
function hideModal(){
  modal.classList.remove('show');
  modalBody.innerHTML = '';
  document.body.style.overflow = '';
}
modalClose.addEventListener('click', hideModal);
modal.addEventListener('click', (e)=>{ if (e.target.classList.contains('backdrop')) hideModal(); });
document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') hideModal(); });

/* ===== DETAIL MATCH → tampil di modal ===== */
async function fetchMatch(id){const r=await fetch('/api/match/'+id);if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
function statTable(title, home, away){
  const keys = new Set([...(home||[]), ...(away||[])].map(s=>s.type));
  const get = (arr, k) => (arr.find(x=>x.type===k)?.value ?? '-');
  return `
  <div class="panel">
    <div class="head">${title}</div>
    <div class="twrap">
      <table class="t">
        <thead><tr><th style="width:36%">Home</th><th>Stat</th><th style="width:36%">Away</th></tr></thead>
        <tbody>
          ${[...keys].map(k=>`<tr><td>${get(home,k)}</td><td>${k}</td><td>${get(away,k)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}
function minuteTable(title, dist){
  return `
  <div class="panel">
    <div class="head">${title.toUpperCase()}</div>
    <div class="twrap">
      <table class="t">
        <thead><tr><th>Time</th><th>Scored</th><th>Conceded</th></tr></thead>
        <tbody>
          ${(dist||[]).map(r=>`<tr><td>${r.bucket}</td><td>${r.for}</td><td>${r.against}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}
function eventsBlock(list){
  if (!list || !list.length) return `<div class="muted mini">Belum ada event.</div>`;
  return `
    <div class="grid">
      ${list.sort((a,b)=>a.time-b.time).map(e=>`
        <div class="evt">
          <div class="t">${e.time}'</div>
          <div><span class="badge">${e.team}</span> — ${e.type}${e.detail?(' · '+e.detail):''}${e.player?(' · '+e.player):''}</div>
        </div>`).join('')}
    </div>`;
}
async function openMatch(id){
  showModal(`<div class="panel"><div class="head">MATCH DATA</div><div class="twrap"><div style="padding:12px" class="muted">Memuat detail…</div></div></div>`);
  try{
    const d = await fetchMatch(id);
    const sb = d.scoreboard || {};
    const header = `
      <div class="panel live">
        <div class="head">SCOREBOARD</div>
        <div class="twrap">
          <div style="padding:14px" class="grid cols-3">
            <div style="text-align:right;font-weight:800">${sb.home||'-'}</div>
            <div style="text-align:center;font-size:28px;font-weight:900">${sb.score||'-'}</div>
            <div style="font-weight:800">${sb.away||'-'}</div>
            <div class="muted" style="grid-column:1 / -1; text-align:center">Status: <span class="pill">${sb.time||'-'}</span></div>
          </div>
          <div class="divider"></div>
          <div style="padding:12px">
            <div class="mini muted" style="margin-bottom:6px">Events</div>
            ${eventsBlock(d.events)}
          </div>
        </div>
      </div>`;
    const stats = statTable('STATISTIK PERTANDINGAN', d.stats?.home||[], d.stats?.away||[]);
    const mins = `
      <div class="grid cols-2">
        ${minuteTable('HOME — Scored/Conceded (15 min)', d.distribution?.home||[])}
        ${minuteTable('AWAY — Scored/Conceded (15 min)', d.distribution?.away||[])}
      </div>`;
    modalBody.innerHTML = header + stats + mins;
  }catch{
    modalBody.innerHTML = `<div class="panel"><div class="head">MATCH DATA</div><div class="twrap"><div style="padding:12px" class="muted">Gagal memuat data.</div></div></div>`;
  }
}


(function(){
  const fab = document.getElementById('mcFab');
  const sheet = document.getElementById('mcSheet');
  const closeBtn = document.getElementById('mcClose');
  if(!fab || !sheet || !closeBtn) return;
  const open = () => { sheet.classList.add('show'); fab.setAttribute('aria-expanded','true'); sheet.setAttribute('aria-hidden','false'); };
  const close = () => { sheet.classList.remove('show'); fab.setAttribute('aria-expanded','false'); sheet.setAttribute('aria-hidden','true'); };
  const toggle = () => sheet.classList.contains('show') ? close() : open();
  fab.addEventListener('click', toggle);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', e => { if(e.key === 'Escape') close(); });
  document.addEventListener('click', (e)=>{ if(!sheet.classList.contains('show')) return; const within = sheet.contains(e.target) || fab.contains(e.target); if(!within) close(); });
})();
