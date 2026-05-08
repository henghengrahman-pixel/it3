/* ===== Helpers ===== */
const $ = s => document.querySelector(s);
const el = h => {const d=document.createElement('div'); d.innerHTML=h.trim(); return d.firstChild;}
const ymd = d => d.toISOString().slice(0,10);
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;}
const fmtID = d => d.toLocaleDateString('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});

/* ===== Logo behavior: refresh + scroll to top ===== */
document.getElementById('logoBtn').addEventListener('click', ()=>{
  window.scrollTo({top:0, behavior:'smooth'});
  location.reload();
});

/* ===== Slider ===== */
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

  const go = (n,hold=false)=>{
    idx = (n+slides)%slides;
    track.style.transform = `translateX(-${idx*100}%)`;
    setDots();
    if(hold){reset();}
  };
  const next = ()=>go(idx+1);
  const prev = ()=>go(idx-1);

  const reset = ()=>{
    if(timer) clearInterval(timer);
    timer = setInterval(next, 3500);
  };

  document.getElementById('next').onclick = ()=>go(idx+1,true);
  document.getElementById('prev').onclick = ()=>go(idx-1,true);
  slider.addEventListener('mouseenter', ()=>timer&&clearInterval(timer));
  slider.addEventListener('mouseleave', reset);

  // swipe
  slider.addEventListener('touchstart', e=>{startX=e.touches[0].clientX; deltaX=0; if(timer) clearInterval(timer);});
  slider.addEventListener('touchmove', e=>{deltaX = e.touches[0].clientX - startX;});
  slider.addEventListener('touchend', ()=>{ if(Math.abs(deltaX)>40){ deltaX>0?prev():next(); } reset(); });

  reset();
})();

/* ===== PRIORITAS URUTAN (liga & pertandingan) ===== */
const MAJOR_LEAGUES = [
  'UEFA CHAMPIONS LEAGUE',
  'UEFA EUROPA LEAGUE',
  'UEFA EUROPA CONFERENCE LEAGUE',
  'ENGLAND - PREMIER LEAGUE',
  'SPAIN - LA LIGA',
  'ITALY - SERIE A',
  'GERMANY - BUNDESLIGA',
  'FRANCE - LIGUE 1'
];
const INDO_LEAGUES = ['INDONESIA - LIGA 1','INDONESIA - LIGA 2','INDONESIA'];
const BIG_TEAMS = [
  'Real Madrid','Barcelona','Atlético','Manchester City','Manchester United',
  'Liverpool','Arsenal','Chelsea','Tottenham',
  'Bayern','Dortmund','PSG','Inter','AC Milan','Juventus','Napoli',
  'Ajax','PSV','Benfica','Porto'
];
const ID_TEAMS = [
  'Persib','Persija','Persebaya','Arema','Bali United','PSM','Persik','Dewa United',
  'Madura United','Borneo','Persita','Barito Putera'
];

function groupPriority(title='') {
  const T = title.toUpperCase().trim();
  const m = MAJOR_LEAGUES.findIndex(x => T.includes(x));
  if (m !== -1) return 1 + m;
  const i = INDO_LEAGUES.findIndex(x => T.includes(x));
  if (i !== -1) return 100 + i;
  return 1000;
}
function matchPriority(row) {
  const m = (row.match || '').toLowerCase();
  let score = 0;
  BIG_TEAMS.forEach(t => { if (m.includes(t.toLowerCase())) score += 10; });
  if (m.includes('derby')) score += 4;
  ID_TEAMS.forEach(t => { if (m.includes(t.toLowerCase())) score += 6; });
  return score;
}

/* ===== Prediksi skor ===== */
function estimateScore(r){
  if (r.predictedScore) return r.predictedScore;
  const match = r.match || '';
  const [home, away] = match.split(' vs ');
  const tip = r.tip || 'Draw';
  const c = Math.max(0, Math.min(100, Number(r.confidence ?? 50)));
  const flip = s => { const [a,b]=s.split('-').map(x=>x.trim()); return `${b} - ${a}`; };
  if (tip === 'Draw'){
    if (c >= 75) return '1 - 1';
    if (c >= 55) return '0 - 0';
    return '1 - 1';
  } else {
    let s = '1 - 0';
    if (c >= 85) s = '3 - 1';
    else if (c >= 75) s = '2 - 0';
    else if (c >= 65) s = '2 - 1';
    else s = '1 - 0';
    if (tip !== home) s = flip(s);
    return s;
  }
}

/* ====== FIX: tampilkan bendera di judul panel ====== */
function panelSkor(title, rows, flag){
  return `
  <section class="panel" data-title="${title}">
    <div class="head">
      ${flag ? `<img src="${flag}" alt="" onerror="this.style.display='none'" style="height:14px;vertical-align:-2px;margin-right:8px;border-radius:2px" />` : ``}
      ${title.toUpperCase()}
    </div>
    <div class="twrap">
      <table class="t">
        <thead>
          <tr>
            <th style="width:170px">Tanggal & Waktu (WIB)</th>
            <th>PREDIKSI SKOR</th>
            <th style="width:110px">Skor</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r,i)=>`
            <tr class="${i%2?'alt':''}" data-row="${(r.match||'').toLowerCase()}">
              <td class="time">${r.kickoff || '-'}</td>
              <td>${r.match}</td>
              <td class="score">${estimateScore(r)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

/* === render PREDIKSI === */
function render(data){
  const root = $('#content');
  root.innerHTML = '';

  const groups = [...(data.groups || [])].sort((a,b) => groupPriority(a.title) - groupPriority(b.title));

  groups.forEach(g => {
    const rows = [...(g.rows || [])].sort((r1, r2) => matchPriority(r2) - matchPriority(r1));
    root.appendChild(el(panelSkor(g.title, rows, g.flag))); /* <= kirim flag dari backend */
  });

  applyFilter($('#q').value.trim().toLowerCase());
}

/* ===== Data dari backend ===== */
async function fetchData(dateStr){
  const r = await fetch('/api/fixtures?date='+encodeURIComponent(dateStr));
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}
// fallback demo
function demo(dateStr){
  return {
    date:dateStr,
    groups:[
      { title:'ENGLAND - PREMIER LEAGUE', flag:'https://flagcdn.com/w20/gb.png', rows:[
        { kickoff:'20/09 18:30 WIB', match:'Liverpool vs Everton', tip:'Liverpool', confidence:78 },
        { kickoff:'20/09 21:00 WIB', match:'Brighton vs Tottenham', tip:'Tottenham', confidence:58 },
        { kickoff:'20/09 23:30 WIB', match:'Man United vs Chelsea', tip:'Man United', confidence:61 }
      ]},
      { title:'ITALY - SERIE A', flag:'https://flagcdn.com/w20/it.png', rows:[
        { kickoff:'20/09 23:00 WIB', match:'Hellas Verona vs Juventus', tip:'Juventus', confidence:72 },
        { kickoff:'21/09 01:45 WIB', match:'Udinese vs AC Milan', tip:'AC Milan', confidence:59 }
      ]}
    ]
  };
}

async function load(d){
  const ds = ymd(d);
  document.getElementById('dateLine').textContent = fmtID(d);
  const loader=$('#loader'); loader.classList.add('show');
  try{
    const data = await fetchData(ds);
    render(data);
  }catch(e){
    render(demo(ds));
  }finally{
    loader.classList.remove('show');
  }
}

/* ===== Search filter (liga/tim) ===== */
function applyFilter(q){
  const panels = document.querySelectorAll('.panel');
  panels.forEach(p=>{
    const ttl = (p.dataset.title||'').toLowerCase();
    let visibleAny = false;
    p.querySelectorAll('tbody tr').forEach(tr=>{
      const row = tr.getAttribute('data-row') || '';
      const show = !q || row.includes(q) || ttl.includes(q);
      tr.style.display = show ? '' : 'none';
      if(show) visibleAny = true;
    });
    p.style.display = visibleAny ? '' : 'none';
  });
}
document.getElementById('q').addEventListener('input', e=>{
  applyFilter(e.target.value.trim().toLowerCase());
});

/* ===== Boot ===== */
document.getElementById('y').textContent = new Date().getFullYear();
load(new Date());

(function(){
    const fab = document.getElementById('mcFab');
    const sheet = document.getElementById('mcSheet');
    const closeBtn = document.getElementById('mcClose');

    const open = () => { sheet.classList.add('show'); fab.setAttribute('aria-expanded','true'); sheet.setAttribute('aria-hidden','false'); }
    const close = () => { sheet.classList.remove('show'); fab.setAttribute('aria-expanded','false'); sheet.setAttribute('aria-hidden','true'); }
    const toggle = () => sheet.classList.contains('show') ? close() : open();

    fab.addEventListener('click', toggle);
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', e => { if(e.key === 'Escape') close(); });

    // optional: auto close ketika klik di luar sheet
    document.addEventListener('click', (e)=>{
      if(!sheet.classList.contains('show')) return;
      const within = sheet.contains(e.target) || fab.contains(e.target);
      if(!within) close();
    });
  })();
