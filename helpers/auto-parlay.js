import crypto from "crypto";
import { readJson, writeJson } from "./json-db.js";
import { getPosts, savePosts } from "./store.js";
import { slugify, makeExcerpt } from "./slug.js";
import {
  getFixturesByDate,
  normalizeFixture
} from "./football-api.js";

const TZ =
  process.env.AUTO_PARLAY_TIMEZONE ||
  "Asia/Jakarta";

const STATUS_FILE =
  "auto-parlay-status.json";

const DEFAULT_THUMBNAIL =
  process.env.AUTO_PARLAY_THUMBNAIL_URL ||
  "https://i.ibb.co/RTFBCzGc/image.png";

const DEFAULT_AUTHOR =
  process.env.AUTO_PARLAY_AUTHOR ||
  "Master Parlay";

const PRIORITY_LEAGUES = [
  {
    key:"Liga Indonesia",
    names:[
      "Liga 1",
      "BRI Liga 1",
      "Indonesia Liga 1",
      "Indonesia"
    ],
    score:100
  },

  {
    key:"Premier League",
    names:[
      "Premier League",
      "England Premier League"
    ],
    score:98
  },

  {
    key:"Champions League",
    names:[
      "Champions League",
      "UEFA Champions League"
    ],
    score:97
  },

  {
    key:"Europa League",
    names:[
      "Europa League",
      "UEFA Europa League"
    ],
    score:95
  },

  {
    key:"La Liga",
    names:[
      "La Liga",
      "Spain La Liga",
      "Primera Division"
    ],
    score:94
  },

  {
    key:"Serie A",
    names:[
      "Serie A",
      "Italy Serie A"
    ],
    score:93
  },

  {
    key:"Bundesliga",
    names:[
      "Bundesliga",
      "Germany Bundesliga"
    ],
    score:92
  },

  {
    key:"Ligue 1",
    names:[
      "Ligue 1",
      "France Ligue 1"
    ],
    score:90
  },

  {
    key:"Saudi Pro League",
    names:[
      "Saudi Pro League"
    ],
    score:88
  },

  {
    key:"MLS",
    names:[
      "MLS",
      "Major League Soccer"
    ],
    score:85
  }
];

const BLOCKED_KEYWORDS = [
  "Women",
  "Woman",
  "Female",
  "Feminine",
  "Feminin",
  "Ladies",

  "U15",
  "U16",
  "U17",
  "U18",
  "U19",
  "U20",
  "U21",
  "U22",
  "U23",

  "Youth",
  "Reserve",
  "Reserves",

  "Friendly",
  "Friendlies",

  "Amateur",

  "Esoccer",
  "E-soccer",
  "Virtual"
];

let timer = null;
let running = false;

function blockedTeam(name = ""){
  const n =
    String(name || "")
      .toLowerCase()
      .trim();

  return (
    n.includes(" women") ||
    n.includes(" woman") ||
    n.includes(" female") ||
    n.includes(" feminine") ||
    n.includes(" feminin") ||
    n.includes(" ladies") ||

    n.endsWith(" w") ||
    n.includes(" w ") ||

    n.includes(" u15") ||
    n.includes(" u16") ||
    n.includes(" u17") ||
    n.includes(" u18") ||
    n.includes(" u19") ||
    n.includes(" u20") ||
    n.includes(" u21") ||
    n.includes(" u22") ||
    n.includes(" u23") ||

    n.includes(" reserve") ||
    n.includes(" reserves") ||

    n.includes(" youth") ||

    n.includes(" esoccer") ||
    n.includes(" e-soccer") ||

    n.includes(" virtual")
  );
}

function cleanLeagueName(name = ""){
  return String(name || "").trim();
}

function getLeaguePriority(name = ""){
  const leagueName =
    cleanLeagueName(name)
      .toLowerCase();

  if (!leagueName){
    return null;
  }

  if (
    BLOCKED_KEYWORDS.some(keyword =>
      leagueName.includes(
        keyword.toLowerCase()
      )
    )
  ){
    return null;
  }

  return PRIORITY_LEAGUES.find(item =>
    item.names.some(n =>
      leagueName.includes(
        n.toLowerCase()
      )
    )
  ) || null;
}

function allowedLeague(name = ""){
  return !!getLeaguePriority(name);
}

function hashNum(text){
  const hex =
    crypto
      .createHash("sha256")
      .update(String(text))
      .digest("hex")
      .slice(0, 8);

  return parseInt(hex, 16);
}

function clamp(num, min, max){
  return Math.max(
    min,
    Math.min(max, num)
  );
}

function formatWIB(value){
  if (!value){
    return "-";
  }

  const d =
    new Date(value);

  if (
    Number.isNaN(
      d.getTime()
    )
  ){
    return "-";
  }

  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: TZ,
      hour:"2-digit",
      minute:"2-digit",
      hour12:false
    })
    .format(d)
    .replace(".", ":")
  ) + " WIB";
}

function predictMatch(fixture){
  const seed =
    hashNum(
      `${fixture.id}|${fixture.home}|${fixture.away}`
    );

  const homePower =
    55 + (seed % 20);

  const awayPower =
    50 + ((seed >> 2) % 20);

  const diff =
    homePower - awayPower;

  let pick = "X";

  if (diff >= 8){
    pick = "1";
  } else if (diff <= -8){
    pick = "2";
  }

  let confidence =
    60 + Math.abs(diff);

  confidence =
    clamp(confidence, 52, 78);

  const risk =
    confidence >= 72
      ? "SAFE"
      : confidence >= 63
        ? "MEDIUM"
        : "RISKY";

  const homeGoals =
    pick === "1"
      ? 2
      : pick === "2"
        ? 1
        : 1;

  const awayGoals =
    pick === "2"
      ? 2
      : pick === "1"
        ? 1
        : 1;

  const totalGoals =
    homeGoals + awayGoals;

  return {
    match:
      `${fixture.home} vs ${fixture.away}`,

    league:fixture.league,

    pick,

    pickLabel:
      pick === "1"
        ? fixture.home
        : pick === "2"
          ? fixture.away
          : "Seri",

    doubleChance:
      pick === "2"
        ? "X2"
        : "1X",

    handicap:
      confidence >= 72
        ? "-0.5"
        : "0",

    ou:
      totalGoals >= 3
        ? "OVER 2.5"
        : "UNDER 3.5",

    btts:
      homeGoals > 0 &&
      awayGoals > 0
        ? "YES"
        : "NO",

    score:
      `${homeGoals} - ${awayGoals}`,

    confidence,

    risk,

    odds:
      confidence >= 72
        ? 1.55
        : 1.95,

    time:
      fixture.date,

    timeWib:
      formatWIB(fixture.date)
  };
}

function groupPredictions(fixtures){
  const grouped =
    new Map();

  for (const raw of fixtures){
    const f =
      normalizeFixture(raw);

    if (!f){
      continue;
    }

    if (
      !f.home ||
      !f.away ||
      !f.league
    ){
      continue;
    }

    if (
      blockedTeam(f.home) ||
      blockedTeam(f.away)
    ){
      continue;
    }

    if (
      !allowedLeague(
        f.league
      )
    ){
      continue;
    }

    const prediction =
      predictMatch(f);

    if (
      !grouped.has(f.league)
    ){
      grouped.set(
        f.league,
        []
      );
    }

    grouped
      .get(f.league)
      .push(prediction);
  }

  return [...grouped.entries()]
    .map(([league, matches]) => ({
      league,
      matches
    }))
    .filter(x => x.matches.length);
}

function buildHtmlContent(predictions){
  return `
<h2>Parlay Safe Pick Hari Ini</h2>

<p>
Berikut rangkuman prediksi pertandingan pilihan hari ini dari beberapa liga utama yang sudah difilter lebih rapi dan fokus pada pertandingan yang lebih layak dijadikan pilihan parlay.
</p>

${predictions.map(group => `
<h2>${group.league}</h2>

<div class="table-wrap">
<table>
<thead>
<tr>
<th>No</th>
<th>Pertandingan</th>
<th>Pick</th>
<th>DC</th>
<th>O/U</th>
<th>Skor</th>
<th>Win Rate</th>
<th>Level</th>
</tr>
</thead>

<tbody>

${group.matches.map((m, i) => `
<tr>
<td>${i + 1}</td>

<td>
<strong>${m.match}</strong>
<br>
<small>${m.timeWib}</small>
</td>

<td>${m.pickLabel}</td>

<td>${m.doubleChance}</td>

<td>${m.ou}</td>

<td>${m.score}</td>

<td>${m.confidence}%</td>

<td>${m.risk}</td>
</tr>
`).join("")}

</tbody>
</table>
</div>

${group.matches.slice(0,3).map(m => `
<p>
<strong>${m.match}</strong> diprediksi menjadi salah satu pertandingan menarik di ${group.league}. Pilihan utama mengarah ke <strong>${m.pickLabel}</strong> dengan estimasi skor <strong>${m.score}</strong> dan confidence sekitar <strong>${m.confidence}%</strong>.
</p>
`).join("")}

`).join("")}

<h2>Catatan Prediksi</h2>

<p>
Prediksi ini dibuat sebagai referensi tambahan sebelum menentukan pilihan parlay. Tetap gunakan manajemen modal dengan baik dan hindari bermain berlebihan.
</p>
`;
}

export async function getAutoParlayStatus(){
  return readJson(STATUS_FILE, {
    enabled:true,
    running:false
  });
}

export async function generateDailyParlay(){
  if (running){
    return;
  }

  running = true;

  try {

    const now =
      new Date();

    const date =
      now
        .toISOString()
        .slice(0,10);

    const apiResult =
      await getFixturesByDate(date);

    if (!apiResult.ok){
      throw new Error(
        apiResult.error
      );
    }

    const predictions =
      groupPredictions(
        apiResult.fixtures
      );

    const posts =
      await getPosts({
        includeDrafts:true
      });

    const title =
      `Prediksi Bola Hari Ini ${date}`;

    const slug =
      slugify(title);

    const content =
      buildHtmlContent(
        predictions
      );

    const post = {

      id:
        crypto.randomUUID(),

      title,

      slug,

      category:
        "Prediksi Parlay",

      author:
        DEFAULT_AUTHOR,

      thumbnail:
        DEFAULT_THUMBNAIL,

      excerpt:
        makeExcerpt(
          "Prediksi bola hari ini lengkap dengan safe pick, big match, over under, BTTS, dan confidence pilihan."
        ),

      content,

      published:true,

      autoGenerated:true,

      createdAt:
        now.toISOString(),

      updatedAt:
        now.toISOString()
    };

    const filteredPosts =
      posts.filter(post =>
        !post.autoGenerated
      );

    filteredPosts.unshift(post);

    await savePosts(
      filteredPosts
    );

    await writeStatus({
      running:false,
      lastSuccessAt:
        now.toISOString()
    });

    return {
      ok:true
    };

  } catch (err){

    await writeStatus({
      running:false,
      lastError:
        err.message
    });

    return {
      ok:false,
      error:err.message
    };

  } finally {

    running = false;

  }
}

async function writeStatus(update){

  const current =
    await readJson(
      STATUS_FILE,
      {}
    );

  const next = {
    ...current,
    ...update
  };

  await writeJson(
    STATUS_FILE,
    next
  );

  return next;
}

export function startAutoParlayScheduler(){

  if (
    process.env.AUTO_PARLAY_ENABLED ===
    "false"
  ){
    return;
  }

  const scheduleNext = ()=>{

    const delay =
      1000 *
      60 *
      60 *
      24;

    timer =
      setTimeout(async()=>{

        await generateDailyParlay();

        scheduleNext();

      }, delay);
  };

  scheduleNext();
}

export function stopAutoParlayScheduler(){

  if (timer){
    clearTimeout(timer);
  }

  timer = null;
}
