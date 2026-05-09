import crypto from "crypto";
import { readJson, writeJson } from "./json-db.js";
import { getPosts, savePosts } from "./store.js";
import { slugify, makeExcerpt } from "./slug.js";
import {
  getFixturesByDate,
  normalizeFixture
} from "./football-api.js";

const TZ = process.env.AUTO_PARLAY_TIMEZONE || "Asia/Jakarta";
const STATUS_FILE = "auto-parlay-status.json";

const DEFAULT_THUMBNAIL =
  process.env.AUTO_PARLAY_THUMBNAIL_URL ||
  "https://i.ibb.co/RTFBCzGc/image.png";

const PRIORITY_LEAGUES = [
  { key:"Liga Indonesia", names:["Liga 1","BRI Liga 1","Indonesia Liga 1","Indonesia"], score:100 },
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

const BIG_TEAMS = [
  "Persib","Persija","Persebaya","Arema","Bali United","PSM","Borneo",
  "Manchester City","Manchester United","Liverpool","Arsenal","Chelsea","Tottenham",
  "Real Madrid","Barcelona","Atletico Madrid",
  "Inter","Juventus","AC Milan","Napoli","Roma",
  "Bayern","Dortmund","Leverkusen",
  "PSG","Marseille","Lyon",
  "Al Nassr","Al Hilal","Inter Miami"
];

let timer = null;
let running = false;

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

function formatWIB(value){
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ,
    hour:"2-digit",
    minute:"2-digit",
    hour12:false
  }).format(d).replace(".", ":") + " WIB";
}

function hashNum(text){
  const hex = crypto.createHash("sha256").update(String(text)).digest("hex").slice(0,8);
  return parseInt(hex, 16);
}

function clamp(num, min, max){
  return Math.max(min, Math.min(max, num));
}

function seededPick(seed, list){
  return list[Math.abs(seed) % list.length];
}

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

function isBigMatch(home = "", away = "", league = ""){
  const h = String(home).toLowerCase();
  const a = String(away).toLowerCase();

  const count = BIG_TEAMS.filter(t => {
    const x = t.toLowerCase();
    return h.includes(x) || a.includes(x);
  }).length;

  if (count >= 2) return true;

  const info = getLeaguePriority(league);
  return count >= 1 && info && info.score >= 90;
}

function makeOdds(confidence, risk, seed){
  let base = 2.55 - (confidence / 100);

  if (risk === "SAFE") base -= 0.14;
  if (risk === "RISKY") base += 0.18;

  base += (seed % 14) / 100;

  return Number(clamp(base, 1.38, 2.35).toFixed(2));
}

function makeHandicap(pick, confidence){
  if (pick === "X") return "+0.25";
  if (confidence >= 80) return "-0.75";
  if (confidence >= 72) return "-0.5";
  return "+0";
}

function predictMatch(fixture){
  const seed = hashNum(`${fixture.id}|${fixture.home}|${fixture.away}|${fixture.date}`);
  const homeSeed = hashNum(`${fixture.home}|home-power`);
  const awaySeed = hashNum(`${fixture.away}|away-power`);
  const leagueInfo = getLeaguePriority(fixture.league) || { score:70 };

  const homePower = 50 + (homeSeed % 38);
  const awayPower = 49 + (awaySeed % 38);
  const homeBoost = 5 + (seed % 7);
  const leagueBoost = Math.round((leagueInfo.score - 70) / 7);

  const diff = (homePower + homeBoost + leagueBoost) - awayPower;

  let pick = "X";
  if (diff >= 9) pick = "1";
  else if (diff <= -8) pick = "2";

  let confidence = 58 + Math.abs(diff);
  if (pick === "X") confidence = 56 + (seed % 9);
  confidence = clamp(confidence, 56, 84);

  let risk = "MEDIUM";
  if (confidence >= 76) risk = "SAFE";
  if (confidence < 64) risk = "RISKY";

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

  let pickLabel = "Seri";
  if (pick === "1") pickLabel = fixture.home;
  if (pick === "2") pickLabel = fixture.away;

  const doubleChance =
    confidence >= 76 && pick !== "X"
      ? pick
      : pick === "2"
        ? "X2"
        : "1X";

  const handicap = makeHandicap(pick, confidence);
  const odds = makeOdds(confidence, risk, seed);
  const bigMatch = isBigMatch(fixture.home, fixture.away, fixture.league);

  const score = `${homeGoals} – ${awayGoals}`;
  const timeWib = formatWIB(fixture.date);

  const analysis = buildAnalysis({
    seed,
    home: fixture.home,
    away: fixture.away,
    league: fixture.league,
    pick,
    pickLabel,
    confidence,
    risk,
    ou,
    btts,
    score,
    handicap,
    timeWib,
    bigMatch
  });

  return {
    match:`${fixture.home} vs ${fixture.away}`,
    home:fixture.home,
    away:fixture.away,
    league:fixture.league,
    pick,
    pickLabel,
    doubleChance,
    handicap,
    ou,
    btts,
    score,
    confidence,
    risk,
    odds,
    bigMatch,
    analysis,
    time:fixture.date,
    timeWib,
    fixtureId:fixture.id
  };
}

function buildAnalysis({ seed, home, away, league, pick, pickLabel, confidence, risk, ou, btts, score, handicap, timeWib, bigMatch }){
  const riskText =
    risk === "SAFE"
      ? "masuk kategori aman untuk dijadikan bahan utama kombinasi parlay"
      : risk === "MEDIUM"
        ? "masih cukup layak, tetapi lebih pas dipadukan dengan pilihan yang lebih aman"
        : "lebih cocok dijadikan opsi tambahan karena tingkat risikonya lebih tinggi";

  const openers = [
    `${home} dan ${away} akan bertemu dalam jadwal ${league} pukul ${timeWib}.`,
    `Duel ${home} vs ${away} menjadi salah satu laga yang menarik untuk dipantau dari ${league}.`,
    `Pertandingan ${league} antara ${home} melawan ${away} punya peluang menghadirkan permainan terbuka.`,
    `${home} menghadapi ${away} dengan kondisi pertandingan yang cukup menarik untuk pasar parlay.`
  ];

  const pickTexts = {
    "1": [
      `${home} lebih layak diunggulkan karena memiliki peluang lebih stabil untuk menguasai jalannya laga.`,
      `Pilihan utama mengarah ke ${home}, terutama jika melihat keuntungan bermain dan potensi serangan yang lebih hidup.`,
      `${home} terlihat lebih solid untuk dijadikan pick utama pada pertandingan ini.`
    ],
    "2": [
      `${away} punya peluang cukup baik untuk mencuri hasil positif dari laga ini.`,
      `Arah prediksi condong ke ${away} karena peluang serangan balik dan efektivitas permainan terlihat cukup menarik.`,
      `${away} menjadi pilihan utama dengan potensi kemenangan yang masih terbuka.`
    ],
    "X": [
      `Laga ini berpotensi berjalan ketat, sehingga hasil seri cukup masuk akal.`,
      `Kedua tim terlihat punya peluang yang seimbang, maka opsi seri menjadi pilihan yang cukup menarik.`,
      `Pertandingan diprediksi tidak mudah untuk salah satu pihak, sehingga hasil imbang cukup terbuka.`
    ]
  };

  const marketTexts = [
    `Market gol mengarah ke ${ou}, sementara BTTS berada di posisi ${btts}.`,
    `Untuk pilihan tambahan, ${ou} bisa dipertimbangkan dengan opsi BTTS ${btts}.`,
    `Dari sisi jumlah gol, pilihan ${ou} terlihat lebih masuk, dengan BTTS ${btts}.`
  ];

  const finalTexts = [
    `Confidence berada di angka ${confidence}% dengan handicap ${handicap}.`,
    `Win rate estimasi ${confidence}% membuat pilihan ini ${riskText}.`,
    `Dengan estimasi skor ${score}, pilihan ini ${riskText}.`
  ];

  const badgeText = bigMatch
    ? " Laga ini juga masuk kategori big match sehingga cocok diberi perhatian lebih."
    : "";

  return [
    seededPick(seed, openers),
    seededPick(seed >> 2, pickTexts[pick]),
    seededPick(seed >> 4, marketTexts),
    seededPick(seed >> 6, finalTexts),
    `Prediksi skor akhir: ${score}.${badgeText}`
  ].join(" ");
}

function groupPredictions(fixtures){
  const grouped = new Map();
  const usedFixtures = new Set();

  for (const raw of fixtures){
    const f = normalizeFixture(raw);

    if (!f || !f.league || !f.home || !f.away) continue;
    if (usedFixtures.has(String(f.id))) continue;

    usedFixtures.add(String(f.id));

    if (["FT","AET","PEN","PST","CANC","ABD","AWD","WO"].includes(f.status)){
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
        if (b.bigMatch !== a.bigMatch) return Number(b.bigMatch) - Number(a.bigMatch);
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

function getAllMatches(predictions){
  return predictions.flatMap(row => row.matches.map(m => ({
    ...m,
    league: row.league
  })));
}

function makeTableRows(matches){
  return matches.map((m, i)=>`
<tr>
  <td>${i + 1}</td>
  <td>
    <strong>${m.match}</strong>
    ${m.bigMatch ? `<br><small>🔥 Big Match</small>` : ``}
    <br><small>${m.timeWib}</small>
  </td>
  <td>${m.pickLabel}</td>
  <td>${m.doubleChance}</td>
  <td>${m.handicap}</td>
  <td>${m.ou}</td>
  <td>${m.btts}</td>
  <td>${m.score}</td>
  <td>${m.confidence}%</td>
  <td>${m.odds}</td>
  <td>${m.risk}</td>
</tr>`).join("");
}

function contentFromPredictions(title, predictions){
  const allMatches = getAllMatches(predictions);
  const leagueNames = predictions.slice(0, 6).map(p => p.league).join(", ");
  const total = allMatches.length;

  const safeParlay3 = allMatches
    .filter(m => m.risk === "SAFE")
    .sort((a,b)=>b.confidence - a.confidence)
    .slice(0, 3);

  const topConfidence = allMatches
    .sort((a,b)=>b.confidence - a.confidence)
    .slice(0, 8);

  const bigMatches = allMatches
    .filter(m => m.bigMatch)
    .slice(0, 6);

  const indonesiaSection = predictions.find(p => {
    const info = getLeaguePriority(p.league);
    return info && info.key === "Liga Indonesia";
  });

  const safeRows = makeTableRows(safeParlay3.length ? safeParlay3 : topConfidence.slice(0, 3));
  const topRows = makeTableRows(topConfidence);
  const bigRows = bigMatches.length ? makeTableRows(bigMatches) : "";

  const indonesiaHtml = indonesiaSection ? `
<h2>Prediksi Liga Indonesia Hari Ini</h2>
<p>
Liga Indonesia tetap menjadi prioritas utama dalam daftar prediksi hari ini. Pilihan berikut disusun agar member lebih mudah melihat laga lokal yang paling menarik untuk bahan parlay.
</p>
<div class="table-wrap">
<table>
<thead>
<tr>
  <th>No</th><th>Pertandingan</th><th>Pick</th><th>DC</th><th>HDP</th><th>O/U</th><th>BTTS</th><th>Skor</th><th>Win Rate</th><th>Odds</th><th>Level</th>
</tr>
</thead>
<tbody>
${makeTableRows(indonesiaSection.matches)}
</tbody>
</table>
</div>
${indonesiaSection.matches.slice(0, 4).map(m => `<p><strong>${m.match}</strong> — ${m.analysis}</p>`).join("")}
` : "";

  const leagueSections = predictions
    .filter(group => group !== indonesiaSection)
    .map(group => `
<h2>Prediksi ${group.league}</h2>
<div class="table-wrap">
<table>
<thead>
<tr>
  <th>No</th><th>Pertandingan</th><th>Pick</th><th>DC</th><th>HDP</th><th>O/U</th><th>BTTS</th><th>Skor</th><th>Win Rate</th><th>Odds</th><th>Level</th>
</tr>
</thead>
<tbody>
${makeTableRows(group.matches)}
</tbody>
</table>
</div>
${group.matches.slice(0, 4).map(m => `<p><strong>${m.match}</strong> — ${m.analysis}</p>`).join("")}
`).join("");

  return `
<p>
<strong>${title}</strong> menyajikan rangkuman prediksi bola hari ini dengan susunan yang lebih rapi, natural, dan fokus pada pertandingan dari Liga Indonesia serta liga-liga besar dunia.
</p>

<p>
Total tersedia <strong>${total} pertandingan pilihan</strong> dari beberapa kompetisi utama seperti <strong>${leagueNames}</strong>. Setiap laga dilengkapi pick utama, double chance, handicap, over/under, BTTS, estimasi skor, odds estimasi, jam WIB, dan win rate.
</p>

<h2>Safe Parlay 3 Tim Hari Ini</h2>
<p>
Berikut kombinasi 3 pilihan utama dengan tingkat keyakinan paling stabil untuk bahan parlay hari ini.
</p>

<div class="table-wrap">
<table>
<thead>
<tr>
  <th>No</th><th>Pertandingan</th><th>Pick</th><th>DC</th><th>HDP</th><th>O/U</th><th>BTTS</th><th>Skor</th><th>Win Rate</th><th>Odds</th><th>Level</th>
</tr>
</thead>
<tbody>
${safeRows}
</tbody>
</table>
</div>

<h2>Top Confidence Hari Ini</h2>
<p>
Daftar ini berisi pilihan dengan win rate tertinggi dari seluruh pertandingan yang tersedia.
</p>

<div class="table-wrap">
<table>
<thead>
<tr>
  <th>No</th><th>Pertandingan</th><th>Pick</th><th>DC</th><th>HDP</th><th>O/U</th><th>BTTS</th><th>Skor</th><th>Win Rate</th><th>Odds</th><th>Level</th>
</tr>
</thead>
<tbody>
${topRows}
</tbody>
</table>
</div>

${bigRows ? `
<h2>Big Match Pilihan</h2>
<p>
Beberapa laga besar hari ini memiliki perhatian lebih tinggi karena melibatkan tim populer atau kompetisi utama.
</p>
<div class="table-wrap">
<table>
<thead>
<tr>
  <th>No</th><th>Pertandingan</th><th>Pick</th><th>DC</th><th>HDP</th><th>O/U</th><th>BTTS</th><th>Skor</th><th>Win Rate</th><th>Odds</th><th>Level</th>
</tr>
</thead>
<tbody>
${bigRows}
</tbody>
</table>
</div>
` : ""}

${indonesiaHtml}

${leagueSections}

<h2>Catatan Prediksi Parlay</h2>
<p>
Prediksi ini dibuat sebagai referensi tambahan sebelum memilih tiket parlay. Gunakan kombinasi secara bijak, pilih market yang paling nyaman, dan utamakan manajemen modal agar permainan tetap terkontrol.
</p>
`;
}

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

    const rows = force
      ? posts.filter(p => !(p.autoGenerated && p.autoDate === targetDate))
      : posts;

    const slug = await uniqueSlugForDate(title, rows);
    const content = contentFromPredictions(title, predictions);
    const now = new Date().toISOString();

    const allMatches = getAllMatches(predictions);
    const totalMatches = allMatches.length;

    const topPicks = allMatches
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
        "Safe Pick",
        "Big Match"
      ],
      author: process.env.AUTO_PARLAY_AUTHOR || "Master Parlay",
      thumbnail: DEFAULT_THUMBNAIL,
      excerpt: makeExcerpt(
        `Prediksi parlay hari ini berisi ${totalMatches} pertandingan pilihan dari Liga Indonesia dan liga besar, lengkap dengan Safe Parlay 3 Tim, big match, pick utama, double chance, handicap, over/under, BTTS, skor, odds estimasi, dan win rate.`
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

export function stopAutoParlayScheduler(){
  if (timer) clearTimeout(timer);
  timer = null;
}
