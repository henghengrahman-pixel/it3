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

const DEFAULT_AUTHOR =
  process.env.AUTO_PARLAY_AUTHOR ||
  "Master Parlay";

const PRIORITY_LEAGUES = [
  { key:"Liga Indonesia", names:["Liga 1","BRI Liga 1","Indonesia Liga 1","Indonesia"], score:100 },
  { key:"Premier League", names:["Premier League","England Premier League"], score:98 },
  { key:"Champions League", names:["Champions League","UEFA Champions League"], score:97 },
  { key:"Europa League", names:["Europa League","UEFA Europa League"], score:95 },
  { key:"La Liga", names:["La Liga","Spain La Liga","Primera Division"], score:94 },
  { key:"Serie A", names:["Serie A","Italy Serie A"], score:93 },
  { key:"Bundesliga", names:["Bundesliga","Germany Bundesliga"], score:92 },
  { key:"Ligue 1", names:["Ligue 1","France Ligue 1"], score:90 },
  { key:"AFC Champions League", names:["AFC Champions League","AFC Champions League Elite"], score:88 },
  { key:"Saudi Pro League", names:["Saudi Pro League","Pro League"], score:84 },
  { key:"MLS", names:["MLS","Major League Soccer"], score:80 },
  { key:"Copa Libertadores", names:["Copa Libertadores","CONMEBOL Libertadores"], score:78 }
];

const BLOCKED_KEYWORDS = [
  "Women","Female","Feminine",
  "U17","U18","U19","U20","U21","U22","U23",
  "Youth","Reserve","Reserves",
  "Friendly","Friendlies",
  "Amateur",
  "Esoccer","E-soccer",
  "Virtual"
];

const BIG_TEAMS = [
  "Persib","Persija","Persebaya","PSM","Bali United","Arema","Borneo",
  "Manchester City","Manchester United","Liverpool","Arsenal","Chelsea","Tottenham",
  "Real Madrid","Barcelona","Atletico Madrid",
  "Inter","Juventus","AC Milan","Napoli","Roma",
  "Bayern","Dortmund","Leverkusen",
  "PSG","Marseille","Lyon",
  "Al Nassr","Al Hilal",
  "Inter Miami"
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

function nextScheduleDelay(){
  const p = nowParts();

  const targetHour = Number(process.env.AUTO_PARLAY_HOUR || 9);
  const targetMinute = Number(process.env.AUTO_PARLAY_MINUTE || 0);

  const currentMs =
    (((p.hour * 60) + p.minute) * 60 + p.second) * 1000;

  const targetMs =
    (((targetHour * 60) + targetMinute) * 60) * 1000;

  let diff = targetMs - currentMs;

  if (diff <= 0){
    diff += 24 * 60 * 60 * 1000;
  }

  return diff;
}

function prettyDate(dateString){
  const monthNames = [
    "JANUARI","FEBRUARI","MARET","APRIL","MEI","JUNI",
    "JULI","AGUSTUS","SEPTEMBER","OKTOBER","NOVEMBER","DESEMBER"
  ];

  const [y,m,d] = dateString.split("-").map(Number);

  return `${String(d).padStart(2,"0")} ${monthNames[m-1]} ${y}`;
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
  const hex = crypto
    .createHash("sha256")
    .update(String(text))
    .digest("hex")
    .slice(0, 8);

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

  if (
    BLOCKED_KEYWORDS.some(x =>
      leagueName.includes(x.toLowerCase())
    )
  ){
    return null;
  }

  for (const item of PRIORITY_LEAGUES){
    if (
      item.names.some(n =>
        leagueName.includes(n.toLowerCase())
      )
    ){
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

  return count >= 1 && info && info.score >= 92;
}

function realisticConfidence(diff, pick){
  let confidence;

  if (pick === "X"){
    confidence = 54 + (diff % 6);
  } else {
    confidence = 60 + diff;
  }

  return clamp(confidence, 52, 78);
}

function confidenceLevel(confidence){
  if (confidence >= 72) return "SAFE";
  if (confidence >= 63) return "MEDIUM";
  return "RISKY";
}

function makeOdds(confidence){
  if (confidence >= 76) return 1.42;
  if (confidence >= 74) return 1.48;
  if (confidence >= 72) return 1.55;
  if (confidence >= 70) return 1.65;
  if (confidence >= 68) return 1.75;
  if (confidence >= 66) return 1.85;
  if (confidence >= 64) return 1.95;
  if (confidence >= 62) return 2.05;

  return 2.20;
}

function makeHandicap(pick, confidence){
  if (pick === "X") return "+0.25";

  if (confidence >= 76) return "-1";
  if (confidence >= 72) return "-0.75";
  if (confidence >= 68) return "-0.5";

  return "0";
}

function formPattern(seed){
  const forms = [
    "W-W-W-D-W",
    "W-W-D-W-L",
    "W-D-W-W-D",
    "L-W-W-D-W",
    "D-W-W-W-L"
  ];

  return seededPick(seed, forms);
}

function buildNaturalAnalysis(data){
  const {
    seed,
    home,
    away,
    league,
    pick,
    confidence,
    score,
    ou,
    btts,
    handicap,
    risk,
    bigMatch,
    timeWib
  } = data;

  const homeForm = formPattern(seed);
  const awayForm = formPattern(seed >> 2);

  const opener = [
    `${home} akan menghadapi ${away} dalam lanjutan ${league} pukul ${timeWib}.`,
    `Pertandingan ${home} vs ${away} menjadi salah satu laga yang cukup menarik pada jadwal ${league}.`,
    `${league} kembali menghadirkan duel ${home} kontra ${away} yang cukup layak dipantau untuk pasar parlay.`,
    `${home} dijadwalkan bertemu ${away} dalam pertandingan ${league} hari ini.`
  ];

  const formText = [
    `${home} datang dengan perform yang cukup stabil dalam beberapa pertandingan terakhir.`,
    `${away} masih memiliki potensi memberikan perlawanan terutama lewat permainan transisi cepat.`,
    `Dalam lima pertandingan terakhir, perform kedua tim terlihat cukup berbeda.`,
    `${home} memiliki catatan kandang yang cukup baik belakangan ini.`
  ];

  const pickText = {
    "1":[
      `${home} lebih layak dijadikan pilihan utama karena tampil lebih konsisten.`,
      `Pilihan utama masih mengarah ke ${home} dengan peluang menang yang cukup terbuka.`,
      `${home} diprediksi mampu mengontrol jalannya pertandingan.`
    ],
    "2":[
      `${away} memiliki peluang untuk mencuri poin dalam laga ini.`,
      `Prediksi utama mengarah ke ${away} karena efektivitas permainan mereka cukup baik.`,
      `${away} terlihat punya peluang hasil positif yang cukup menarik.`
    ],
    "X":[
      `Pertandingan ini diprediksi berjalan cukup ketat dan berpeluang berakhir imbang.`,
      `Kedua tim terlihat memiliki kekuatan yang cukup seimbang.`,
      `Potensi hasil seri masih cukup terbuka pada laga ini.`
    ]
  };

  const marketText = [
    `Pilihan market gol mengarah ke ${ou} dengan opsi BTTS ${btts}.`,
    `Dari sisi market tambahan, ${ou} masih cukup menarik untuk dipertimbangkan.`,
    `Potensi terciptanya gol di pertandingan ini cukup terbuka dengan market ${ou}.`
  ];

  const close = [
    `Estimasi skor akhir berada di ${score} dengan handicap ${handicap}.`,
    `Confidence berada di kisaran ${confidence}% dan masuk kategori ${risk}.`,
    `Prediksi skor ${score} membuat laga ini cukup menarik dijadikan bahan kombinasi parlay.`
  ];

  const bigText = bigMatch
    ? " Pertandingan ini juga masuk kategori big match dan memiliki perhatian cukup tinggi."
    : "";

  return [
    seededPick(seed, opener),
    seededPick(seed >> 1, formText),
    seededPick(seed >> 3, pickText[pick]),
    `Form ${home}: ${homeForm}. Form ${away}: ${awayForm}.`,
    seededPick(seed >> 4, marketText),
    seededPick(seed >> 5, close) + bigText
  ].join(" ");
}

function predictMatch(fixture){
  const seed = hashNum(
    `${fixture.id}|${fixture.home}|${fixture.away}|${fixture.date}`
  );

  const homePower =
    55 + (hashNum(fixture.home) % 20);

  const awayPower =
    52 + (hashNum(fixture.away) % 20);

  const leagueBoost =
    Math.round(
      ((getLeaguePriority(fixture.league)?.score || 70) - 70) / 5
    );

  const diff =
    (homePower + leagueBoost + (seed % 5)) - awayPower;

  let pick = "X";

  if (diff >= 8){
    pick = "1";
  } else if (diff <= -7){
    pick = "2";
  }

  const confidence =
    realisticConfidence(Math.abs(diff), pick);

  const risk =
    confidenceLevel(confidence);

  let homeGoals = 1 + (seed % 3);
  let awayGoals = 1 + ((seed >> 2) % 2);

  if (pick === "1" && homeGoals <= awayGoals){
    homeGoals = awayGoals + 1;
  }

  if (pick === "2" && awayGoals <= homeGoals){
    awayGoals = homeGoals + 1;
  }

  if (pick === "X"){
    const drawGoal = (seed % 2) + 1;
    homeGoals = drawGoal;
    awayGoals = drawGoal;
  }

  homeGoals = clamp(homeGoals, 0, 4);
  awayGoals = clamp(awayGoals, 0, 4);

  const totalGoals = homeGoals + awayGoals;

  const ou =
    totalGoals >= 3
      ? "OVER 2.5"
      : "UNDER 3.5";

  const btts =
    homeGoals > 0 && awayGoals > 0
      ? "YES"
      : "NO";

  let pickLabel = "Seri";

  if (pick === "1"){
    pickLabel = fixture.home;
  }

  if (pick === "2"){
    pickLabel = fixture.away;
  }

  const doubleChance =
    pick === "2"
      ? "X2"
      : "1X";

  const handicap =
    makeHandicap(pick, confidence);

  const odds =
    makeOdds(confidence);

  const bigMatch =
    isBigMatch(
      fixture.home,
      fixture.away,
      fixture.league
    );

  const score =
    `${homeGoals} - ${awayGoals}`;

  const timeWib =
    formatWIB(fixture.date);

  const analysis =
    buildNaturalAnalysis({
      seed,
      home:fixture.home,
      away:fixture.away,
      league:fixture.league,
      pick,
      confidence,
      score,
      ou,
      btts,
      handicap,
      risk,
      bigMatch,
      timeWib
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

function groupPredictions(fixtures){
  const grouped = new Map();
  const usedFixtures = new Set();

  for (const raw of fixtures){
    const f = normalizeFixture(raw);

    if (!f) continue;
    if (!f.home || !f.away || !f.league) continue;

    if (usedFixtures.has(String(f.id))){
      continue;
    }

    usedFixtures.add(String(f.id));

    if (
      ["FT","AET","PEN","PST","CANC","ABD","AWD","WO"]
      .includes(f.status)
    ){
      continue;
    }

    if (!allowedLeague(f.league)){
      continue;
    }

    const prediction =
      predictMatch(f);

    if (!grouped.has(f.league)){
      grouped.set(f.league, []);
    }

    grouped.get(f.league).push(prediction);
  }

  return [...grouped.entries()]
    .sort((a,b)=>{
      const ap = getLeaguePriority(a[0])?.score || 0;
      const bp = getLeaguePriority(b[0])?.score || 0;

      return bp - ap;
    })
    .map(([league, matches]) => ({
      league,
      matches:matches
        .sort((a,b)=>{
          if (b.bigMatch !== a.bigMatch){
            return Number(b.bigMatch) - Number(a.bigMatch);
          }

          return b.confidence - a.confidence;
        })
        .slice(0, 10)
    }))
    .filter(x => x.matches.length);
}

function limitLeagues(predictions){
  const maxLeagues =
    Number(process.env.AUTO_PARLAY_MAX_LEAGUES || 8);

  return predictions.slice(0, maxLeagues);
}

function getAllMatches(predictions){
  return predictions.flatMap(x => x.matches);
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
</tr>
`).join("");
}

function contentFromPredictions(title, predictions){
  const allMatches =
    getAllMatches(predictions);

  const total =
    allMatches.length;

  const safePicks =
    allMatches
      .filter(x => x.risk === "SAFE")
      .sort((a,b)=>b.confidence - a.confidence)
      .slice(0, 3);

  const topPicks =
    allMatches
      .sort((a,b)=>b.confidence - a.confidence)
      .slice(0, 10);

  const bigMatches =
    allMatches
      .filter(x => x.bigMatch)
      .slice(0, 6);

  return `
<p>
<strong>${title}</strong> berisi rangkuman prediksi bola pilihan hari ini dari beberapa liga populer dunia dan Liga Indonesia.
</p>

<p>
Total tersedia <strong>${total} pertandingan pilihan</strong> lengkap dengan market utama seperti handicap, over under, BTTS, double chance, estimasi skor, odds estimasi, dan win rate.
</p>

<h2>Safe Parlay 3 Tim Hari Ini</h2>

<div class="table-wrap">
<table>
<thead>
<tr>
<th>No</th>
<th>Pertandingan</th>
<th>Pick</th>
<th>DC</th>
<th>HDP</th>
<th>O/U</th>
<th>BTTS</th>
<th>Skor</th>
<th>Win Rate</th>
<th>Odds</th>
<th>Level</th>
</tr>
</thead>
<tbody>
${makeTableRows(safePicks)}
</tbody>
</table>
</div>

<h2>Top Confidence Hari Ini</h2>

<div class="table-wrap">
<table>
<thead>
<tr>
<th>No</th>
<th>Pertandingan</th>
<th>Pick</th>
<th>DC</th>
<th>HDP</th>
<th>O/U</th>
<th>BTTS</th>
<th>Skor</th>
<th>Win Rate</th>
<th>Odds</th>
<th>Level</th>
</tr>
</thead>
<tbody>
${makeTableRows(topPicks)}
</tbody>
</table>
</div>

${
bigMatches.length
? `
<h2>Big Match Pilihan</h2>

<div class="table-wrap">
<table>
<thead>
<tr>
<th>No</th>
<th>Pertandingan</th>
<th>Pick</th>
<th>DC</th>
<th>HDP</th>
<th>O/U</th>
<th>BTTS</th>
<th>Skor</th>
<th>Win Rate</th>
<th>Odds</th>
<th>Level</th>
</tr>
</thead>
<tbody>
${makeTableRows(bigMatches)}
</tbody>
</table>
</div>
`
: ``
}

${predictions.map(group => `
<h2>Prediksi ${group.league}</h2>

<div class="table-wrap">
<table>
<thead>
<tr>
<th>No</th>
<th>Pertandingan</th>
<th>Pick</th>
<th>DC</th>
<th>HDP</th>
<th>O/U</th>
<th>BTTS</th>
<th>Skor</th>
<th>Win Rate</th>
<th>Odds</th>
<th>Level</th>
</tr>
</thead>
<tbody>
${makeTableRows(group.matches)}
</tbody>
</table>
</div>

${group.matches.slice(0,4).map(m => `
<p>
<strong>${m.match}</strong> — ${m.analysis}
</p>
`).join("")}
`).join("")}

<h2>Catatan Prediksi</h2>

<p>
Prediksi ini dibuat sebagai referensi tambahan sebelum menentukan pilihan parlay. Tetap gunakan manajemen modal dengan baik dan hindari bermain berlebihan.
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

async function uniqueSlug(title, posts){
  const base = slugify(title);

  let slug = base;
  let i = 2;

  while (posts.some(x => x.slug === slug)){
    slug = `${base}-${i++}`;
  }

  return slug;
}

export async function getAutoParlayStatus(){
  return readJson(STATUS_FILE, {
    enabled:true,
    running:false,
    lastRunAt:null,
    lastSuccessAt:null,
    lastError:null,
    lastCreatedSlug:null,
    nextRunAt:null
  });
}

export async function generateDailyParlay({
  force = false,
  date = null
} = {}){
  if (running){
    return {
      ok:false,
      skipped:true,
      message:"Auto parlay sedang berjalan"
    };
  }

  running = true;

  try {
    const targetDate =
      date || nowParts().date;

    await writeStatus({
      running:true,
      lastRunAt:new Date().toISOString(),
      lastError:null
    });

    const posts =
      await getPosts({
        includeDrafts:true
      });

    const existing =
      posts.find(
        x =>
          x.autoGenerated &&
          x.autoDate === targetDate
      );

    if (existing && !force){
      running = false;

      return {
        ok:true,
        skipped:true,
        post:existing
      };
    }

    const apiResult =
      await getFixturesByDate(targetDate);

    if (!apiResult.ok){
      throw new Error(
        apiResult.error || "API ERROR"
      );
    }

    const predictions =
      limitLeagues(
        groupPredictions(apiResult.fixtures)
      );

    if (!predictions.length){
      throw new Error(
        "Tidak ada pertandingan tersedia"
      );
    }

    const title =
      `Prediksi Bola Akurat Hari Ini ${prettyDate(targetDate)} Liga Indonesia & Liga Besar`;

    const slug =
      await uniqueSlug(title, posts);

    const content =
      contentFromPredictions(title, predictions);

    const allMatches =
      getAllMatches(predictions);

    const topPicks =
      allMatches
        .sort((a,b)=>b.confidence - a.confidence)
        .slice(0,5);

    const now =
      new Date().toISOString();

    const post = {
      id:`auto-${crypto.randomUUID().slice(0,8)}`,
      title,
      slug,
      category:"Prediksi Parlay",
      tags:[
        "Prediksi Bola",
        "Prediksi Parlay",
        "Parlay Hari Ini",
        "Safe Pick",
        "Liga Indonesia",
        "Big Match"
      ],
      author:DEFAULT_AUTHOR,
      thumbnail:DEFAULT_THUMBNAIL,
      excerpt:makeExcerpt(
        `Prediksi bola hari ini lengkap dengan safe parlay, big match, handicap, over under, BTTS, odds estimasi, dan win rate pertandingan pilihan.`
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

    const rows =
      force
        ? posts.filter(
            x =>
              !(
                x.autoGenerated &&
                x.autoDate === targetDate
              )
          )
        : posts;

    rows.unshift(post);

    await savePosts(rows);

    await writeStatus({
      running:false,
      lastSuccessAt:now,
      lastCreatedSlug:slug,
      lastError:null
    });

    running = false;

    return {
      ok:true,
      skipped:false,
      post
    };

  } catch (err){
    running = false;

    await writeStatus({
      running:false,
      lastError:err.message || String(err)
    });

    return {
      ok:false,
      error:err.message || String(err)
    };
  }
}

export function startAutoParlayScheduler(){
  if (process.env.AUTO_PARLAY_ENABLED === "false"){
    console.log("[AUTO PARLAY] disabled");
    return;
  }

  const scheduleNext = async () => {
    const delay =
      nextScheduleDelay();

    const nextRunAt =
      new Date(Date.now() + delay).toISOString();

    await writeStatus({
      enabled:true,
      nextRunAt
    }).catch(()=>{});

    timer = setTimeout(async()=>{
      console.log(`[AUTO PARLAY] running ${TZ}`);

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
  if (timer){
    clearTimeout(timer);
  }

  timer = null;
}
