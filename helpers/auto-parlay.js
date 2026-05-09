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
    key:"AFC Champions League",
    names:[
      "AFC Champions League",
      "AFC Champions League Elite"
    ],
    score:88
  },

  {
    key:"Saudi Pro League",
    names:[
      "Saudi Pro League",
      "Pro League"
    ],
    score:84
  },

  {
    key:"MLS",
    names:[
      "MLS",
      "Major League Soccer"
    ],
    score:80
  },

  {
    key:"Copa Libertadores",
    names:[
      "Copa Libertadores",
      "CONMEBOL Libertadores"
    ],
    score:78
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
  "Al Hilal",

  "Inter Miami"
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

function nowParts(date = new Date()){
  const parts =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year:"numeric",
      month:"2-digit",
      day:"2-digit",
      hour:"2-digit",
      minute:"2-digit",
      second:"2-digit",
      hour12:false
    })
    .formatToParts(date)
    .reduce((acc, p)=>{
      acc[p.type] = p.value;
      return acc;
    }, {});

  return {
    date:
      `${parts.year}-${parts.month}-${parts.day}`,

    hour:Number(parts.hour),
    minute:Number(parts.minute),
    second:Number(parts.second)
  };
}

function nextScheduleDelay(){
  const p = nowParts();

  const targetHour =
    Number(
      process.env.AUTO_PARLAY_HOUR || 9
    );

  const targetMinute =
    Number(
      process.env.AUTO_PARLAY_MINUTE || 0
    );

  const currentMs =
    (
      (
        (p.hour * 60) +
        p.minute
      ) * 60 +
      p.second
    ) * 1000;

  const targetMs =
    (
      (
        (targetHour * 60) +
        targetMinute
      ) * 60
    ) * 1000;

  let diff =
    targetMs - currentMs;

  if (diff <= 0){
    diff +=
      24 * 60 * 60 * 1000;
  }

  return diff;
}

function prettyDate(dateString){
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

  return `
    ${String(d).padStart(2,"0")}
    ${monthNames[m - 1]}
    ${y}
  `.replace(/\s+/g, " ").trim();
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

function seededPick(seed, list){
  return list[
    Math.abs(seed) % list.length
  ];
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

  if (
    leagueName.includes("women") ||
    leagueName.includes("woman") ||
    leagueName.includes("female") ||
    leagueName.includes("feminine") ||
    leagueName.includes("feminin") ||
    leagueName.includes("ladies")
  ){
    return null;
  }

  for (const item of PRIORITY_LEAGUES){
    if (
      item.names.some(n =>
        leagueName.includes(
          n.toLowerCase()
        )
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

function isBigMatch(
  home = "",
  away = "",
  league = ""
){
  const h =
    String(home).toLowerCase();

  const a =
    String(away).toLowerCase();

  const count =
    BIG_TEAMS.filter(team => {
      const x =
        team.toLowerCase();

      return (
        h.includes(x) ||
        a.includes(x)
      );
    }).length;

  if (count >= 2){
    return true;
  }

  const info =
    getLeaguePriority(league);

  return (
    count >= 1 &&
    info &&
    info.score >= 92
  );
}

function realisticConfidence(
  diff,
  pick
){
  let confidence;

  if (pick === "X"){
    confidence =
      54 + (diff % 6);
  } else {
    confidence =
      60 + diff;
  }

  return clamp(
    confidence,
    52,
    78
  );
}

function confidenceLevel(
  confidence
){
  if (confidence >= 72){
    return "SAFE";
  }

  if (confidence >= 63){
    return "MEDIUM";
  }

  return "RISKY";
}

function makeOdds(confidence){
  if (confidence >= 76){
    return 1.42;
  }

  if (confidence >= 74){
    return 1.48;
  }

  if (confidence >= 72){
    return 1.55;
  }

  if (confidence >= 70){
    return 1.65;
  }

  if (confidence >= 68){
    return 1.75;
  }

  if (confidence >= 66){
    return 1.85;
  }

  if (confidence >= 64){
    return 1.95;
  }

  if (confidence >= 62){
    return 2.05;
  }

  return 2.20;
}

function makeHandicap(
  pick,
  confidence
){
  if (pick === "X"){
    return "+0.25";
  }

  if (confidence >= 76){
    return "-1";
  }

  if (confidence >= 72){
    return "-0.75";
  }

  if (confidence >= 68){
    return "-0.5";
  }

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

  const homeForm =
    formPattern(seed);

  const awayForm =
    formPattern(seed >> 2);

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

  const bigText =
    bigMatch
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
  const seed =
    hashNum(
      `${fixture.id}|${fixture.home}|${fixture.away}|${fixture.date}`
    );

  const homePower =
    55 +
    (
      hashNum(fixture.home) % 20
    );

  const awayPower =
    52 +
    (
      hashNum(fixture.away) % 20
    );

  const leagueBoost =
    Math.round(
      (
        (
          getLeaguePriority(
            fixture.league
          )?.score || 70
        ) - 70
      ) / 5
    );

  const diff =
    (
      homePower +
      leagueBoost +
      (seed % 5)
    ) - awayPower;

  let pick = "X";

  if (diff >= 8){
    pick = "1";
  } else if (diff <= -7){
    pick = "2";
  }

  const confidence =
    realisticConfidence(
      Math.abs(diff),
      pick
    );

  const risk =
    confidenceLevel(
      confidence
    );

  let homeGoals =
    1 + (seed % 3);

  let awayGoals =
    1 + (
      (seed >> 2) % 2
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
    const drawGoal =
      (seed % 2) + 1;

    homeGoals =
      drawGoal;

    awayGoals =
      drawGoal;
  }

  homeGoals =
    clamp(homeGoals, 0, 4);

  awayGoals =
    clamp(awayGoals, 0, 4);

  const totalGoals =
    homeGoals + awayGoals;

  const ou =
    totalGoals >= 3
      ? "OVER 2.5"
      : "UNDER 3.5";

  const btts =
    (
      homeGoals > 0 &&
      awayGoals > 0
    )
      ? "YES"
      : "NO";

  let pickLabel = "Seri";

  if (pick === "1"){
    pickLabel =
      fixture.home;
  }

  if (pick === "2"){
    pickLabel =
      fixture.away;
  }

  const doubleChance =
    pick === "2"
      ? "X2"
      : "1X";

  const handicap =
    makeHandicap(
      pick,
      confidence
    );

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
    formatWIB(
      fixture.date
    );

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
    match:
      `${fixture.home} vs ${fixture.away}`,

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
  const grouped =
    new Map();

  const usedFixtures =
    new Set();

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
      usedFixtures.has(
        String(f.id)
      )
    ){
      continue;
    }

    usedFixtures.add(
      String(f.id)
    );

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

    const leagueName =
      String(f.league || "")
        .toLowerCase()
        .trim();

    if (
      leagueName.includes("women") ||
      leagueName.includes("woman") ||
      leagueName.includes("female") ||
      leagueName.includes("feminine") ||
      leagueName.includes("feminin") ||
      leagueName.includes("ladies")
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
          .sort((a,b)=>{
            if (
              b.bigMatch !==
              a.bigMatch
            ){
              return (
                Number(b.bigMatch) -
                Number(a.bigMatch)
              );
            }

            return (
              b.confidence -
              a.confidence
            );
          })
          .slice(0, 10)
    }))
    .filter(x => x.matches.length);
}
