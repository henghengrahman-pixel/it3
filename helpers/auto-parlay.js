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

const TZ =
  process.env.AUTO_PARLAY_TIMEZONE ||
  "Asia/Jakarta";

const STATUS_FILE =
  "auto-parlay-status.json";

const DEFAULT_THUMBNAIL =
  process.env.AUTO_PARLAY_THUMBNAIL_URL ||
  "https://i.ibb.co/RTFBCzGc/image.png";

/* =========================
   PRIORITAS LIGA
========================= */

const PRIORITY_LEAGUES = [

  // INDONESIA
  "Liga 1",
  "BRI Liga 1",

  // INGGRIS
  "Premier League",

  // SPANYOL
  "La Liga",

  // ITALIA
  "Serie A",

  // JERMAN
  "Bundesliga",

  // PRANCIS
  "Ligue 1",

  // EROPA
  "UEFA Champions League",
  "UEFA Europa League",
  "UEFA Europa Conference League",

  // ASIA
  "Saudi Pro League",
  "AFC Champions League",

  // AMERIKA
  "MLS",
  "Copa Libertadores"

];

/* =========================
   BLOCKED
========================= */

const BLOCKED_KEYWORDS = [

  "Women",
  "Female",
  "Feminine",

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

  "Amateur"

];

let timer = null;
let running = false;

/* =========================
   DATE
========================= */

function nowParts(date = new Date()){

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: TZ,
        year:"numeric",
        month:"2-digit",
        day:"2-digit",
        hour:"2-digit",
        minute:"2-digit",
        second:"2-digit",
        hour12:false
      }
    )

    .formatToParts(date)

    .reduce((acc, p) => {

      acc[p.type] = p.value;

      return acc;

    }, {});

  return {

    date:
      `${parts.year}-${parts.month}-${parts.day}`,

    year:
      Number(parts.year),

    month:
      Number(parts.month),

    day:
      Number(parts.day),

    hour:
      Number(parts.hour),

    minute:
      Number(parts.minute),

    second:
      Number(parts.second)

  };

}

function addDays(dateString, amount){

  const d =
    new Date(
      `${dateString}T00:00:00.000Z`
    );

  d.setUTCDate(
    d.getUTCDate() + amount
  );

  return d
    .toISOString()
    .slice(0,10);

}

function nextMidnightDelay(){

  const p = nowParts();

  const msToday =
    (
      (
        p.hour * 60 +
        p.minute
      ) * 60 +
      p.second
    ) * 1000;

  const oneDay =
    24 * 60 * 60 * 1000;

  return Math.max(
    1000,
    oneDay - msToday + 1500
  );

}

/* =========================
   TITLE DATE
========================= */

function prettyDateRange(dateString){

  const monthNames = [

    "JANUARI",
    "FEBRUARI",
    "MARET",
    "APRIL",
    "MEI",
    "JUNI",
    "JULI",
    "AGUSTUS",
    "SEPTEMBER",
    "OKTOBER",
    "NOVEMBER",
    "DESEMBER"

  ];

  const [y,m,d] =
    dateString
      .split("-")
      .map(Number);

  const next =
    addDays(dateString, 1);

  const [ny,nm,nd] =
    next
      .split("-")
      .map(Number);

  if (m === nm && y === ny){

    return `
${String(d).padStart(2,"0")}
–
${String(nd).padStart(2,"0")}
${monthNames[m-1]}
${y}
`.replace(/\s+/g,' ').trim();

  }

  return `
${String(d).padStart(2,"0")}
${monthNames[m-1]}
${y}
–
${String(nd).padStart(2,"0")}
${monthNames[nm-1]}
${ny}
`.replace(/\s+/g,' ').trim();

}

/* =========================
   HASH
========================= */

function hashNum(text){

  const hex =
    crypto
      .createHash("sha256")
      .update(String(text))
      .digest("hex")
      .slice(0,8);

  return parseInt(hex, 16);

}

/* =========================
   AI PREDICT
========================= */

function predictMatch(fixture){

  const seed =
    hashNum(`
${fixture.id}
${fixture.home}
${fixture.away}
${fixture.date}
`);

  const homePower =
    45 +
    (
      hashNum(
        `${fixture.home}-home`
      ) % 55
    );

  const awayPower =
    45 +
    (
      hashNum(
        `${fixture.away}-away`
      ) % 55
    );

  const homeBoost =
    8 + (seed % 7);

  const diff =
    (
      homePower +
      homeBoost
    ) - awayPower;

  let pick = "X";

  if (diff > 9) pick = "1";

  if (diff < -6) pick = "2";

  let homeGoals =
    1 + (seed % 3);

  let awayGoals =
    1 + (
      (seed >> 3) % 3
    );

  if (
    pick === "1" &&
    homeGoals <= awayGoals
  ){

    homeGoals =
      awayGoals + 1;

  }

  if (
    pick === "2" &&
    awayGoals <= homeGoals
  ){

    awayGoals =
      homeGoals + 1;

  }

  if (pick === "X"){

    const g =
      (seed % 2) + 1;

    homeGoals = g;
    awayGoals = g;

  }

  homeGoals =
    Math.min(homeGoals, 4);

  awayGoals =
    Math.min(awayGoals, 4);

  const ou =
    (
      homeGoals +
      awayGoals
    ) >= 3
      ? "OVER"
      : "UNDER";

  return {

    match:
      `${fixture.home} vs ${fixture.away}`,

    pick,

    ou,

    score:
      `${homeGoals} – ${awayGoals}`,

    time:
      fixture.date,

    fixtureId:
      fixture.id

  };

}

/* =========================
   FILTER LIGA
========================= */

function allowedLeague(name = ""){

  if (!name) return false;

  // BLOCK
  if (
    BLOCKED_KEYWORDS.some(
      word =>
        name
          .toLowerCase()
          .includes(
            word.toLowerCase()
          )
    )
  ){
    return false;
  }

  // PRIORITAS
  return PRIORITY_LEAGUES.includes(name);

}

/* =========================
   GROUP
========================= */

function groupPredictions(fixtures){

  const grouped =
    new Map();

  for (const raw of fixtures){

    const f =
      normalizeFixture(raw);

    // STATUS
    if (
      [
        "FT",
        "AET",
        "PEN",
        "PST",
        "CANC",
        "ABD",
        "AWD",
        "WO"
      ].includes(f.status)
    ){
      continue;
    }

    // FILTER LIGA
    if (
      !allowedLeague(
        f.league
      )
    ){
      continue;
    }

    const item =
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
      .push(item);

  }

  // SORT PRIORITAS
  const sorted =
    [...grouped.entries()]
      .sort((a,b)=>{

        const ai =
          PRIORITY_LEAGUES.indexOf(a[0]);

        const bi =
          PRIORITY_LEAGUES.indexOf(b[0]);

        return ai - bi;

      });

  return sorted.map(
    ([league, matches]) => ({

      league,

      matches:
        matches.slice(
          0,
          Number(
            process.env
            .AUTO_PARLAY_MAX_MATCHES_PER_LEAGUE ||
            12
          )
        )

    })

  ).filter(
    x => x.matches.length
  );

}

/* =========================
   LIMIT
========================= */

function limitLeagues(predictions){

  const maxLeagues =
    Number(
      process.env
      .AUTO_PARLAY_MAX_LEAGUES ||
      10
    );

  const maxMatches =
    Number(
      process.env
      .AUTO_PARLAY_MAX_MATCHES ||
      40
    );

  const result = [];

  let count = 0;

  for (const league of predictions){

    if (
      result.length >= maxLeagues ||
      count >= maxMatches
    ){
      break;
    }

    const left =
      maxMatches - count;

    const matches =
      league.matches.slice(0, left);

    if (matches.length){

      result.push({

        league:
          league.league,

        matches

      });

      count += matches.length;

    }

  }

  return result;

}
