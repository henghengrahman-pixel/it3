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

const BIG_TEAMS = [
  "Persib",
  "Persija",
  "Persebaya",
  "PSM",
  "Bali United",
  "Arema",
  "Borneo",
  "Manchester City",
  "Manchester United",
  "Liverpool",
  "Arsenal",
  "Chelsea",
  "Tottenham",
  "Real Madrid",
  "Barcelona",
  "Atletico Madrid",
  "Inter",
  "Juventus",
  "AC Milan",
  "Napoli",
  "Roma",
  "Bayern",
  "Dortmund",
  "Leverkusen",
  "PSG",
  "Marseille",
  "Lyon",
  "Al Nassr",
  "Al Hilal"
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

function isBigTeam(name = ""){

  const n =
    String(name)
      .toLowerCase();

  return BIG_TEAMS.some(team =>

    n.includes(
      team.toLowerCase()
    )

  );
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

  let homePower =
    55 + (seed % 20);

  let awayPower =
    50 + ((seed >> 2) % 20);

  if (isBigTeam(fixture.home)){
    homePower += 10;
  }

  if (isBigTeam(fixture.away)){
    awayPower += 10;
  }

  if (
    fixture.league
      .toLowerCase()
      .includes("indonesia")
  ){
    homePower += 5;
  }

  const diff =
    homePower - awayPower;

  let pick = "X";

  if (diff >= 8){
    pick = "1";
  }

  else if (diff <= -8){
    pick = "2";
  }

  let confidence =
    60 + Math.abs(diff);

  confidence =
    clamp(confidence, 52, 78);

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

    home:
      fixture.home,

    away:
      fixture.away,

    homeLogo:
      fixture.homeLogo,

    awayLogo:
      fixture.awayLogo,

    league:
      fixture.league,

    pick,

    ou:
      totalGoals >= 3
        ? "OVER 2.5"
        : "UNDER 3.5",

    score:
      `${homeGoals}-${awayGoals}`,

    time:
      fixture.date,

    timeWib:
      formatWIB(fixture.date),

    confidence
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
    .sort((a,b)=>{

      const ap =
        getLeaguePriority(a[0])
          ?.score || 0;

      const bp =
        getLeaguePriority(b[0])
          ?.score || 0;

      return bp - ap;

    })
    .map(([league, matches]) => ({

      league,

      matches:
        matches
          .sort((a,b)=>
            b.confidence -
            a.confidence
          )
          .slice(0, 10)

    }))
    .filter(x =>
      x.matches.length
    );
}

function buildHtmlContent(predictions){

  return `

<div class="prediction-wrapper">

<h2 class="prediction-title">
Prediksi Parlay Hari Ini
</h2>

<p class="prediction-desc">
Berikut rangkuman pertandingan pilihan dari liga besar dunia dan Liga Indonesia yang memiliki peluang menarik untuk dijadikan referensi parlay hari ini.
</p>

${predictions.map(group => `

<div class="league-section">

<h2 class="league-title">
${group.league}
</h2>

<div class="match-grid">

${group.matches.map((m, i) => `

<div class="match-card">

<div class="match-header">

<div class="match-number">
#${i + 1}
</div>

<div class="match-time">
${m.timeWib}
</div>

</div>

<div class="match-body">

<div class="team-row">

<div class="team">

<img
src="${m.homeLogo}"
alt="${m.home}"
loading="lazy"
/>

<span>
${m.home}
</span>

</div>

<div class="vs">
VS
</div>

<div class="team">

<img
src="${m.awayLogo}"
alt="${m.away}"
loading="lazy"
/>

<span>
${m.away}
</span>

</div>

</div>

<div class="prediction-boxes">

<div class="pred-box">

<small>
1X2
</small>

<strong>
${m.pick}
</strong>

</div>

<div class="pred-box">

<small>
O/U
</small>

<strong>
${m.ou}
</strong>

</div>

<div class="pred-box">

<small>
SKOR
</small>

<strong>
${m.score}
</strong>

</div>

</div>

</div>

</div>

`).join("")}

</div>

</div>

`).join("")}

<div class="prediction-note">

<h3>
Catatan Prediksi
</h3>

<p>
Prediksi ini dibuat sebagai tambahan referensi sebelum menentukan pilihan pertandingan. Tetap gunakan manajemen modal dengan baik dan bermain secara bijak.
</p>

</div>

</div>

`;
}

export async function getAutoParlayStatus(){

  return readJson(
    STATUS_FILE,
    {
      enabled:true,
      running:false
    }
  );
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
          "Prediksi bola hari ini lengkap dengan pertandingan pilihan dari liga besar dunia dan Liga Indonesia."
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
