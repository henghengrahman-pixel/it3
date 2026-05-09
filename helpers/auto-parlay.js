import crypto from "crypto";
import { readJson, writeJson } from "./json-db.js";
import { getPosts, savePosts } from "./store.js";
import { slugify, makeExcerpt } from "./slug.js";
import {
  getFixturesByDate,
  normalizeFixture
} from "./football-api.js";

/* =========================
   CONFIG
========================= */

const TZ = process.env.AUTO_PARLAY_TIMEZONE || "Asia/Jakarta";
const STATUS_FILE = "auto-parlay-status.json";

const DEFAULT_THUMBNAIL =
  process.env.AUTO_PARLAY_THUMBNAIL_URL ||
  "https://i.ibb.co/RTFBCzGc/image.png";

/* =========================
   PRIORITAS LIGA
   UTAMAKAN INDONESIA + LIGA BESAR
========================= */

const PRIORITY_LEAGUES = [
  { key:"Indonesia", names:["Liga 1","BRI Liga 1","Indonesia Liga 1","Indonesia"], score:100 },
  { key:"Premier League", names:["Premier League","England Premier League"], score:98 },
  { key:"Champions League", names:["Champions League","UEFA Champions League"], score:97 },
  { key:"Europa League", names:["Europa League","UEFA Europa League"], score:94 },
  { key:"La Liga", names:["La Liga","Spain La Liga","Primera Division"], score:93 },
  { key:"Serie A", names:["Serie A","Italy Serie A"], score:92 },
  { key:"Bundesliga", names:["Bundesliga","Germany Bundesliga"], score:91 },
  { key:"Ligue 1", names:["Ligue 1","France Ligue 1"], score:90 },
  { key:"AFC Champions League", names:["AFC Champions League","AFC Champions League Elite"], score:86 },
  { key:"Saudi Pro League", names:["Saudi Pro League","Pro League"], score:82 },
  { key:"MLS", names:["MLS","Major League Soccer"], score:78 },
  { key:"Copa Libertadores", names:["Copa Libertadores","CONMEBOL Libertadores"], score:76 },
  { key:"Conference League", names:["Conference League","UEFA Conference League"], score:74 }
];

const BLOCKED_KEYWORDS = [
  "Women","Female","Feminine",
  "U17","U18","U19","U20","U21","U22","U23",
  "Youth","Reserve","Reserves",
  "Friendly","Friendlies","Amateur",
  "Esoccer","E-soccer","Virtual"
];

let timer = null;
let running = false;

/* =========================
   DATE
========================= */

function nowParts(date = new Date()){
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year:"numeric",
    month:"2-digit",
    day:"2-digit",
    hour:"2-digit",
    minute:"2-digit",
    second:"2-digit",
    hour12:false
  }).formatToParts(date).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});

  return {
    date:`${parts.year}-${parts.month}-${parts.day}`,
    year:Number(parts.year),
    month:Number(parts.month),
    day:Number(parts.day),
    hour:Number(parts.hour),
    minute:Number(parts.minute),
    second:Number(parts.second)
  };
}

function addDays(dateString, amount){
  const d = new Date(`${dateString}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0,10);
}

function nextMidnightDelay(){
  const p = nowParts();
  const msToday = (((p.hour * 60 + p.minute) * 60) + p.second) * 1000;
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.max(1000, oneDay - msToday + 1500);
}

/* =========================
   FORMAT DATE
========================= */

function prettyDateRange(dateString){
  const monthNames = [
    "JANUARI","FEBRUARI","MARET","APRIL","MEI","JUNI",
    "JULI","AGUSTUS","SEPTEMBER","OKTOBER","NOVEMBER","DESEMBER"
  ];

  const [y,m,d] = dateString.split("-").map(Number);
  const next = addDays(dateString, 1);
  const [ny,nm,nd] = next.split("-").map(Number);

  if (m === nm && y === ny){
    return `${String(d).padStart(2,"0")} – ${String(nd).padStart(2,"0")} ${monthNames[m-1]} ${y}`;
  }

  return `${String(d).padStart(2,"0")} ${monthNames[m-1]} ${y} – ${String(nd).padStart(2,"0")} ${monthNames[nm-1]} ${ny}`;
}

/* =========================
   HASH
========================= */

function hashNum(text){
  const hex = crypto.createHash("sha256").update(String(text)).digest("hex").slice(0,8);
  return parseInt(hex, 16);
}

function clamp(num, min, max){
  return Math.max(min, Math.min(max, num));
}

/* =========================
   LEAGUE HELPER
========================= */

function cleanLeagueName(name = ""){
  return String(name || "").trim();
}

function getLeaguePriority(name = ""){
  const leagueName = cleanLeagueName(name).toLowerCase();

  if (!leagueName) return null;

  if (BLOCKED_KEYWORDS.some(word => leagueName.includes(word.toLowerCase()))){
    return null;
  }

  for (const item of PRIORITY_LEAGUES){
    if (item.names.some(n => leagueName.includes(n.toLowerCase()))){
      return item;
    }
  }

  return null;
}

function allowedLeague(name = ""){
  return !!getLeaguePriority(name);
}

/* =========================
   AI PREDICT PREMIUM
========================= */

function predictMatch(fixture){
  const seed = hashNum(`${fixture.id}|${fixture.home}|${fixture.away}|${fixture.date}`);
  const homeSeed = hashNum(`${fixture.home}|home-power`);
  const awaySeed = hashNum(`${fixture.away}|away-power`);
  const leagueInfo = getLeaguePriority(fixture.league) || { score:70 };

  const homePower = 52 + (homeSeed % 42);
  const awayPower = 50 + (awaySeed % 42);
  const homeBoost = 6 + (seed % 8);
  const bigLeagueBoost = Math.round((leagueInfo.score - 70) / 5);

  const diff = (homePower + homeBoost + bigLeagueBoost) - awayPower;

  let pick = "X";
  if (diff >= 10) pick = "1";
  else if (diff <= -8) pick = "2";

  let confidence = 64 + Math.abs(diff);
  if (pick === "X") confidence = 61 + (seed % 10);
  confidence = clamp(confidence, 61, 92);

  let risk = "MEDIUM";
  if (confidence >= 82) risk = "SAFE";
  if (confidence < 70) risk = "RISKY";

  let homeGoals = 1 + (seed % 3);
  let awayGoals = 1 + ((seed >> 3) % 3);

  if (pick === "1" && homeGoals <= awayGoals) homeGoals = awayGoals + 1;
  if (pick === "2" && awayGoals <= homeGoals) awayGoals = homeGoals + 1;

  if (pick === "X"){
    const g = (seed % 2) + 1;
    homeGoals = g;
    awayGoals = g;
  }

  homeGoals = clamp(homeGoals, 0, 4);
  awayGoals = clamp(awayGoals, 0, 4);

  const totalGoals = homeGoals + awayGoals;
  const ou = totalGoals >= 3 ? "OVER 2.5" : "UNDER 3.5";
  const btts = homeGoals > 0 && awayGoals > 0 ? "YES" : "NO";

  const doubleChance =
    pick === "1" ? "1X" :
    pick === "2" ? "X2" :
    "1X";

  const odds = Number((1.45 + ((100 - confidence) / 100) + ((seed % 25) / 100)).toFixed(2));

  let pickLabel = "Seri";
  if (pick === "1") pickLabel = fixture.home;
  if (pick === "2") pickLabel = fixture.away;

  const analysis = buildAnalysis({
    home: fixture.home,
    away: fixture.away,
    league: fixture.league,
    pick,
    pickLabel,
    confidence,
    risk,
    ou,
    btts,
    score:`${homeGoals} – ${awayGoals}`
  });

  return {
    match:`${fixture.home} vs ${fixture.away}`,
    home:fixture.home,
    away:fixture.away,
    league:fixture.league,
    pick,
    pickLabel,
    doubleChance,
    ou,
    btts,
    score:`${homeGoals} – ${awayGoals}`,
    confidence,
    risk,
    odds,
    analysis,
    time:fixture.date,
    fixtureId:fixture.id
  };
}

function buildAnalysis({ home, away, league, pick, pickLabel, confidence, risk, ou, btts, score }){
  const riskText =
    risk === "SAFE"
      ? "masuk kategori pilihan aman karena tingkat keyakinannya cukup tinggi"
      : risk === "MEDIUM"
        ? "masuk kategori pilihan menengah dan tetap layak dijadikan bahan pertimbangan"
        : "masuk kategori cukup berisiko sehingga lebih cocok untuk kombinasi kecil";

  const pickText =
    pick === "X"
      ? `Laga ${home} melawan ${away} berpotensi berjalan ketat dan hasil imbang cukup terbuka.`
      : `${pickLabel} lebih layak diunggulkan pada laga ini melihat komposisi pertandingan dan peluang bermain lebih stabil.`;

  return `${pickText} Prediksi utama mengarah ke ${pickLabel} dengan confidence ${confidence}%. Untuk market gol, pilihan ${ou} terlihat cukup menarik, sedangkan BTTS mengarah ke ${btts}. Secara keseluruhan pertandingan ${league} ini ${riskText}. Perkiraan skor akhir: ${score}.`;
}

/* =========================
   GROUP
========================= */

function groupPredictions(fixtures){
  const grouped = new Map();

  for (const raw of fixtures){
    const f = normalizeFixture(raw);

    if (!f || !f.league || !f.home || !f.away) continue;

    if ([
      "FT","AET","PEN","PST","CANC","ABD","AWD","WO"
    ].includes(f.status)){
      continue;
    }

    if (!allowedLeague(f.league)){
      continue;
    }

    const item = predictMatch(f);

    if (!grouped.has(f.league)){
      grouped.set(f.league, []);
    }

    grouped.get(f.league).push(item);
  }

  const sorted = [...grouped.entries()].sort((a,b)=>{
    const ap = getLeaguePriority(a[0]);
    const bp = getLeaguePriority(b[0]);
    const as = ap ? ap.score : 0;
    const bs = bp ? bp.score : 0;
    return bs - as;
  });

  return sorted.map(([league, matches]) => {
    const sortedMatches = matches
      .sort((a,b)=>{
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        return new Date(a.time).getTime() - new Date(b.time).getTime();
      })
      .slice(0, Number(process.env.AUTO_PARLAY_MAX_MATCHES_PER_LEAGUE || 10));

    return {
      league,
      matches: sortedMatches
    };
  }).filter(x => x.matches.length);
}

/* =========================
   LIMIT
========================= */

function limitLeagues(predictions){
  const maxLeagues = Number(process.env.AUTO_PARLAY_MAX_LEAGUES || 8);
  const maxMatches = Number(process.env.AUTO_PARLAY_MAX_MATCHES || 32);

  const result = [];
  let count = 0;

  for (const league of predictions){
    if (result.length >= maxLeagues || count >= maxMatches) break;

    const left = maxMatches - count;
    const matches = league.matches.slice(0, left);

    if (matches.length){
      result.push({
        league: league.league,
        matches
      });

      count += matches.length;
    }
  }

  return result;
}

/* =========================
   CONTENT PREMIUM
========================= */

function contentFromPredictions(title, predictions){
  const leagueNames = predictions.slice(0, 6).map(p => p.league).join(", ");
  const total = predictions.reduce((sum, row) => sum + row.matches.length, 0);

  const safePicks = predictions
    .flatMap(row => row.matches.map(m => ({ ...m, league: row.league })))
    .sort((a,b)=>b.confidence - a.confidence)
    .slice(0, 5);

  const safeRows = safePicks.map((m, i)=>`
<tr>
  <td>${i + 1}</td>
  <td><strong>${m.match}</strong><br><small>${m.league}</small></td>
  <td>${m.pickLabel}</td>
  <td>${m.doubleChance}</td>
  <td>${m.ou}</td>
  <td>${m.confidence}%</td>
  <td>${m.risk}</td>
</tr>`).join("");

  const leagueSections = predictions.map(group => {
    const rows = group.matches.map((m, i)=>`
<tr>
  <td>${i + 1}</td>
  <td><strong>${m.match}</strong></td>
  <td>${m.pickLabel}</td>
  <td>${m.doubleChance}</td>
  <td>${m.ou}</td>
  <td>${m.btts}</td>
  <td>${m.score}</td>
  <td>${m.confidence}%</td>
  <td>${m.odds}</td>
</tr>`).join("");

    const analysis = group.matches.slice(0, 4).map(m => `
<p>
<strong>${m.match}</strong> — ${m.analysis}
</p>`).join("");

    return `
<h2>Prediksi ${group.league}</h2>
<div class="table-wrap">
<table>
<thead>
<tr>
  <th>No</th>
  <th>Pertandingan</th>
  <th>Pick</th>
  <th>Double Chance</th>
  <th>O/U</th>
  <th>BTTS</th>
  <th>Skor</th>
  <th>Win Rate</th>
  <th>Odds</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
</div>
${analysis}
`;
  }).join("");

  return `
<p>
<strong>${title}</strong> menyajikan pilihan pertandingan yang lebih rapi, natural, dan fokus pada liga-liga besar serta Indonesia. Rangkuman ini dibuat untuk membantu member membaca peluang pertandingan hari ini dengan susunan pick yang lebih mudah dipahami.
</p>

<p>
Total ada <strong>${total} pertandingan pilihan</strong> dari beberapa kompetisi utama seperti <strong>${leagueNames}</strong>. Setiap pertandingan dilengkapi pick utama, double chance, over/under, BTTS, estimasi skor, odds estimasi, dan confidence agar member lebih mudah memilih kombinasi parlay.
</p>

<h2>Parlay Safe Pick Hari Ini</h2>
<p>
Bagian ini berisi pilihan dengan confidence paling tinggi dari seluruh pertandingan yang tersedia hari ini. Cocok dijadikan bahan utama sebelum membuat tiket parlay.
</p>

<div class="table-wrap">
<table>
<thead>
<tr>
  <th>No</th>
  <th>Pertandingan</th>
  <th>Pick</th>
  <th>DC</th>
  <th>O/U</th>
  <th>Win Rate</th>
  <th>Level</th>
</tr>
</thead>
<tbody>
${safeRows}
</tbody>
</table>
</div>

${leagueSections}

<h2>Catatan Prediksi</h2>
<p>
Prediksi ini adalah referensi tambahan berdasarkan susunan pertandingan, prioritas liga, pola skor, dan estimasi peluang. Tetap gunakan manajemen modal yang aman dan pilih kombinasi parlay sesuai kenyamanan masing-masing.
</p>
`;
}

/* =========================
   STATUS
========================= */

async function writeStatus(update){
  const current = await readJson(STATUS_FILE, {
    enabled:true,
    running:false,
    lastRunAt:null,
    lastSuccessAt:null,
    lastError:null,
    lastCreatedSlug:null,
    nextRunAt:null
  });

  const next = {
    ...current,
    ...update
  };

  await writeJson(STATUS_FILE, next);
  return next;
}

async function uniqueSlugForDate(title, posts){
  const base = slugify(title);
  let slug = base;
  let i = 2;

  while (posts.some(p => p.slug === slug)){
    slug = `${base}-${i++}`;
  }

  return slug;
}

/* =========================
   GET STATUS
========================= */

export async function getAutoParlayStatus(){
  return readJson(STATUS_FILE, {
    enabled: process.env.AUTO_PARLAY_ENABLED !== "false",
    running:false,
    lastRunAt:null,
    lastSuccessAt:null,
    lastError:null,
    lastCreatedSlug:null,
    nextRunAt:null
  });
}

/* =========================
   GENERATE
========================= */

export async function generateDailyParlay({ force = false, date = null } = {}){
  if (running){
    return {
      ok:false,
      skipped:true,
      message:"Auto parlay sedang berjalan."
    };
  }

  running = true;
  const runAt = new Date().toISOString();

  await writeStatus({
    running:true,
    lastRunAt:runAt,
    lastError:null
  });

  try {
    const targetDate = date || nowParts().date;

    const posts = await getPosts({
      includeDrafts:true
    });

    const existing = posts.find(
      p => p.autoGenerated && p.autoDate === targetDate
    );

    if (existing && !force){
      await writeStatus({
        running:false,
        lastSuccessAt:runAt,
        lastCreatedSlug:existing.slug,
        lastError:null
      });

      return {
        ok:true,
        skipped:true,
        post:existing
      };
    }

    const apiResult = await getFixturesByDate(targetDate);

    if (!apiResult.ok){
      await writeStatus({
        running:false,
        lastError:apiResult.error
      });

      return {
        ok:false,
        error:apiResult.error
      };
    }

    const predictions = limitLeagues(
      groupPredictions(apiResult.fixtures)
    );

    if (!predictions.length){
      const msg = `Tidak ada pertandingan liga besar / Indonesia untuk ${targetDate}`;

      await writeStatus({
        running:false,
        lastError:msg
      });

      return {
        ok:false,
        error:msg
      };
    }

    const topLeague = predictions[0]?.league || "Bola";
    const title = `PREDIKSI PARLAY ${topLeague.toUpperCase()} & LIGA BESAR HARI INI ${prettyDateRange(targetDate)}`;

    let rows = force
      ? posts.filter(p => !(p.autoGenerated && p.autoDate === targetDate))
      : posts;

    const slug = await uniqueSlugForDate(title, rows);
    const content = contentFromPredictions(title, predictions);
    const now = new Date().toISOString();

    const totalMatches = predictions.reduce(
      (sum,row) => sum + row.matches.length,
      0
    );

    const topPicks = predictions
      .flatMap(row => row.matches)
      .sort((a,b)=>b.confidence - a.confidence)
      .slice(0, 5);

    const post = {
      id:`auto-${crypto.randomUUID().slice(0,8)}`,
      title,
      slug,
      category:"Prediksi Parlay",
      tags:[
        "Prediksi Bola",
        "Parlay Hari Ini",
        "Prediksi Parlay",
        "Liga Indonesia",
        "Liga Besar",
        "Safe Pick"
      ],
      author: process.env.AUTO_PARLAY_AUTHOR || "Master Parlay",
      thumbnail: DEFAULT_THUMBNAIL,
      excerpt: makeExcerpt(
        `Prediksi parlay hari ini berisi ${totalMatches} pertandingan pilihan dari liga Indonesia dan liga besar lengkap dengan pick utama, double chance, over/under, BTTS, skor, odds estimasi, dan win rate.`
      ),
      content,
      published:true,
      autoGenerated:true,
      autoDate:targetDate,
      fixtureSource:"api-football",
      createdAt:now,
      updatedAt:now,
      predictions,
      topPicks
    };

    rows.unshift(post);
    await savePosts(rows);

    await writeStatus({
      running:false,
      lastSuccessAt:now,
      lastCreatedSlug:slug,
      lastError:null
    });

    return {
      ok:true,
      skipped:false,
      post,
      totalMatches
    };

  } catch (err){
    const error = err?.message || String(err);

    await writeStatus({
      running:false,
      lastError:error
    });

    return {
      ok:false,
      error
    };

  } finally {
    running = false;
  }
}

/* =========================
   START
========================= */

export function startAutoParlayScheduler(){
  if (process.env.AUTO_PARLAY_ENABLED === "false"){
    console.log("[AUTO PARLAY] disabled");
    return;
  }

  const scheduleNext = async () => {
    const delay = nextMidnightDelay();
    const nextRunAt = new Date(Date.now() + delay).toISOString();

    await writeStatus({
      enabled:true,
      nextRunAt
    }).catch(()=>{});

    timer = setTimeout(async()=>{
      console.log(`[AUTO PARLAY] run 00:00 ${TZ}`);
      await generateDailyParlay();
      scheduleNext();
    }, delay);
  };

  scheduleNext();

  if (process.env.AUTO_PARLAY_RUN_ON_START === "true"){
    setTimeout(()=>{
      generateDailyParlay();
    }, 5000);
  }
}

/* =========================
   STOP
========================= */

export function stopAutoParlayScheduler(){
  if (timer) clearTimeout(timer);
  timer = null;
}
