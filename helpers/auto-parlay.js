import crypto from "crypto";
import { readJson, writeJson } from "./json-db.js";
import { getPosts, savePosts } from "./store.js";
import { slugify, makeExcerpt } from "./slug.js";
import { getFixturesByDate, normalizeFixture } from "./football-api.js";

const TZ =
  process.env.AUTO_PARLAY_TIMEZONE ||
  "Asia/Jakarta";

const STATUS_FILE =
  "auto-parlay-status.json";

const DEFAULT_THUMBNAIL =
  process.env.AUTO_PARLAY_THUMBNAIL_URL ||
  "https://i.ibb.co/1tFDCWCP/PREDIKSI.png";

let timer = null;
let running = false;

function nowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }
  )
    .formatToParts(date)
    .reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function addDays(dateString, amount) {
  const d = new Date(
    `${dateString}T00:00:00.000Z`
  );

  d.setUTCDate(
    d.getUTCDate() + amount
  );

  return d
    .toISOString()
    .slice(0, 10);
}

function nextMidnightDelay() {
  const p = nowParts();

  const msToday =
    ((p.hour * 60 + p.minute) * 60 +
      p.second) *
    1000;

  const oneDay =
    24 * 60 * 60 * 1000;

  return Math.max(
    1000,
    oneDay - msToday + 1500
  );
}

function prettyDateRange(dateString) {
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

  const [y, m, d] = dateString
    .split("-")
    .map(Number);

  const next = addDays(
    dateString,
    1
  );

  const [ny, nm, nd] = next
    .split("-")
    .map(Number);

  if (m === nm && y === ny) {
    return `${String(d).padStart(
      2,
      "0"
    )} – ${String(nd).padStart(
      2,
      "0"
    )} ${monthNames[m - 1]} ${y}`;
  }

  return `${String(d).padStart(
    2,
    "0"
  )} ${
    monthNames[m - 1]
  } ${y} – ${String(nd).padStart(
    2,
    "0"
  )} ${
    monthNames[nm - 1]
  } ${ny}`;
}

function hashNum(text) {
  const hex = crypto
    .createHash("sha256")
    .update(String(text))
    .digest("hex")
    .slice(0, 8);

  return parseInt(hex, 16);
}

function predictMatch(fixture) {
  const seed = hashNum(
    `${fixture.id}-${fixture.home}-${fixture.away}-${fixture.date}`
  );

  const homePower =
    50 +
    (hashNum(`${fixture.home}`) %
      35);

  const awayPower =
    50 +
    (hashNum(`${fixture.away}`) %
      35);

  const homeAdvantage = 8;

  const totalPower =
    homePower + awayPower;

  const homeChance =
    (homePower + homeAdvantage) /
    (totalPower + homeAdvantage);

  let pick = "X";

  if (homeChance >= 0.58) {
    pick = "1";
  } else if (
    homeChance <= 0.44
  ) {
    pick = "2";
  }

  let homeGoals = 0;
  let awayGoals = 0;

  if (pick === "1") {
    homeGoals =
      1 + (seed % 3);

    awayGoals =
      seed % 2;
  }

  else if (pick === "2") {
    awayGoals =
      1 + (seed % 3);

    homeGoals =
      seed % 2;
  }

  else {
    const draw =
      seed % 2;

    homeGoals = draw;
    awayGoals = draw;
  }

  homeGoals = Math.min(
    homeGoals,
    3
  );

  awayGoals = Math.min(
    awayGoals,
    3
  );

  const totalGoals =
    homeGoals + awayGoals;

  let ou = "UNDER";

  if (totalGoals >= 3) {
    ou = "OVER";
  }

  return {
    match:
      `${fixture.home} vs ${fixture.away}`,

    pick,

    ou,

    score:
      `${homeGoals} - ${awayGoals}`,

    time: fixture.date,

    fixtureId: fixture.id
  };
}

function getLeaguePriority(
  name = ""
) {
  const n = String(name)
    .toLowerCase()
    .trim();

  // UEFA CHAMPIONS
  if (
    n ===
      "uefa champions league" ||
    n === "champions league"
  ) {
    return 1000;
  }

  // PREMIER LEAGUE
  if (
    (
      n.includes(
        "premier league"
      ) &&
      (
        n.includes(
          "england"
        ) ||
        n.includes(
          "english"
        ) ||
        n ===
          "premier league"
      )
    ) ||
    n === "epl"
  ) {
    return 950;
  }

  // LA LIGA
  if (
    n === "la liga" ||
    n === "laliga" ||
    n ===
      "spain la liga"
  ) {
    return 930;
  }

  // SERIE A
  if (
    n === "serie a" ||
    n ===
      "italy serie a"
  ) {
    return 920;
  }

  // BUNDESLIGA
  if (
    n === "bundesliga" ||
    n ===
      "germany bundesliga"
  ) {
    return 910;
  }

  // LIGUE 1
  if (
    n === "ligue 1" ||
    n ===
      "france ligue 1"
  ) {
    return 900;
  }

  // EREDIVISIE
  if (
    n === "eredivisie" ||
    n ===
      "netherlands eredivisie"
  ) {
    return 890;
  }

  // EUROPA LEAGUE
  if (
    n ===
      "uefa europa league" ||
    n ===
      "europa league"
  ) {
    return 880;
  }

  // CONFERENCE LEAGUE
  if (
    n ===
      "uefa europa conference league" ||
    n ===
      "conference league"
  ) {
    return 870;
  }

  // AFC CHAMPIONS
  if (
    n ===
    "afc champions league"
  ) {
    return 860;
  }

  // LIGA INDONESIA
  if (
    (
      n.includes("liga 1") &&
      (
        n.includes(
          "indonesia"
        ) ||
        n.includes("bri") ||
        n === "liga 1"
      )
    ) ||
    n.includes(
      "indonesia super league"
    )
  ) {
    return 850;
  }

  // CUP BESAR
  if (
    n === "fa cup" ||
    n ===
      "coppa italia" ||
    n ===
      "copa del rey"
  ) {
    return 700;
  }

  // selain whitelist dibuang
  return 0;
}

function groupPredictions(
  fixtures
) {
  const grouped =
    new Map();

  for (const raw of fixtures) {
    const f =
      normalizeFixture(raw);

    // skip match selesai
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
    ) {
      continue;
    }

    const leagueName = String(
      f.league ||
        "Unknown League"
    ).trim();

    const lowerLeague =
      leagueName.toLowerCase();

    // FILTER LIGA ANEH
    if (
      lowerLeague.includes(
        "women"
      ) ||
      lowerLeague.includes(
        "female"
      ) ||
      lowerLeague.includes(
        "youth"
      ) ||
      lowerLeague.includes(
        "reserve"
      ) ||
      lowerLeague.includes(
        "reserves"
      ) ||
      lowerLeague.includes(
        "u23"
      ) ||
      lowerLeague.includes(
        "u21"
      ) ||
      lowerLeague.includes(
        "u20"
      ) ||
      lowerLeague.includes(
        "u19"
      ) ||
      lowerLeague.includes(
        "u18"
      ) ||
      lowerLeague.includes(
        "u17"
      ) ||
      lowerLeague.includes(
        "u16"
      ) ||
      lowerLeague.includes(
        "queensland"
      ) ||
      lowerLeague.includes(
        "mongolia"
      ) ||
      lowerLeague.includes(
        "malta"
      ) ||
      lowerLeague.includes(
        "regional"
      ) ||
      lowerLeague.includes(
        "state league"
      )
    ) {
      continue;
    }

    const priority =
      getLeaguePriority(
        leagueName
      );

    // league tidak whitelist
    if (priority <= 0) {
      continue;
    }

    const item =
      predictMatch(f);

    item.priority =
      priority;

    if (
      !grouped.has(
        leagueName
      )
    ) {
      grouped.set(
        leagueName,
        []
      );
    }

    grouped
      .get(leagueName)
      .push(item);
  }

  const result = [
    ...grouped.entries()
  ]
    .map(
      ([league, matches]) => {

        matches.sort(
          (a, b) => {
            return (
              b.priority -
              a.priority
            );
          }
        );

        return {
          league,

          priority:
            getLeaguePriority(
              league
            ),

          matches:
            matches.slice(
              0,
              Number(
                process.env
                  .AUTO_PARLAY_MAX_MATCHES_PER_LEAGUE ||
                  6
              )
            )
        };
      }
    )
    .filter(
      (x) =>
        x.matches.length
    );

  // PRIORITAS LIGA BESAR
  result.sort((a, b) => {
    return (
      b.priority -
      a.priority
    );
  });

  return result;
}

function limitLeagues(
  predictions
) {
  const maxLeagues =
    Number(
      process.env
        .AUTO_PARLAY_MAX_LEAGUES ||
        8
    );

  const maxMatches =
    Number(
      process.env
        .AUTO_PARLAY_MAX_MATCHES ||
        30
    );

  const result = [];

  let count = 0;

  for (const league of predictions) {
    if (
      result.length >=
        maxLeagues ||
      count >= maxMatches
    ) {
      break;
    }

    const left =
      maxMatches - count;

    const matches =
      league.matches.slice(
        0,
        left
      );

    if (matches.length) {
      result.push({
        league:
          league.league,
        matches
      });

      count +=
        matches.length;
    }
  }

  return result;
}

function contentFromPredictions(
  title,
  predictions
) {
  const leagueNames =
    predictions
      .slice(0, 6)
      .map(
        (p) => p.league
      )
      .join(", ");

  const total =
    predictions.reduce(
      (sum, row) =>
        sum +
        row.matches.length,
      0
    );

  return `
<p>
Prediksi parlay malam ini menghadirkan pertandingan pilihan dari kompetisi sepakbola paling populer dan paling banyak dimainkan member hari ini.
</p>

<p>
Artikel <strong>${title}</strong> memuat ${total} pertandingan unggulan dari beberapa liga besar seperti ${
    leagueNames ||
    "liga top dunia"
  }.
</p>

<p>
Setiap pertandingan dilengkapi prediksi 1X2, over/under, dan perkiraan skor akhir untuk membantu analisa pertandingan malam ini.
</p>

<p>
Gunakan prediksi ini sebagai referensi tambahan sebelum menentukan pilihan bermain.
</p>
`;
}

async function writeStatus(
  update
) {
  const current =
    await readJson(
      STATUS_FILE,
      {
        enabled: true,
        running: false,
        lastRunAt: null,
        lastSuccessAt:
          null,
        lastError: null,
        lastCreatedSlug:
          null,
        nextRunAt: null
      }
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

async function uniqueSlugForDate(
  title,
  posts
) {
  const base =
    slugify(title);

  let slug = base;

  let i = 2;

  while (
    posts.some(
      (p) =>
        p.slug === slug
    )
  ) {
    slug = `${base}-${i++}`;
  }

  return slug;
}

export async function getAutoParlayStatus() {
  return readJson(
    STATUS_FILE,
    {
      enabled:
        process.env
          .AUTO_PARLAY_ENABLED !==
        "false",

      running: false,

      lastRunAt: null,

      lastSuccessAt: null,

      lastError: null,

      lastCreatedSlug:
        null,

      nextRunAt: null
    }
  );
}

export async function generateDailyParlay(
  {
    force = false,
    date = null
  } = {}
) {
  if (running) {
    return {
      ok: false,
      skipped: true,
      message:
        "Auto parlay sedang berjalan."
    };
  }

  running = true;

  const runAt =
    new Date().toISOString();

  try {
    await writeStatus({
      running: true,
      lastRunAt: runAt,
      lastError: null
    });
  } catch (err) {
    running = false;

    return {
      ok: false,
      error: err.message
    };
  }

  try {
    const targetDate =
      date ||
      nowParts().date;

    const posts =
      await getPosts({
        includeDrafts:
          true
      });

    const existing =
      posts.find(
        (p) =>
          p.autoGenerated &&
          p.autoDate ===
            targetDate
      );

    if (
      existing &&
      !force
    ) {
      await writeStatus({
        running: false,
        lastSuccessAt:
          runAt,
        lastCreatedSlug:
          existing.slug,
        lastError: null
      });

      return {
        ok: true,
        skipped: true,
        post: existing,
        message:
          "Post otomatis hari ini sudah ada."
      };
    }

    const apiResult =
      await getFixturesByDate(
        targetDate
      );

    if (!apiResult.ok) {
      await writeStatus({
        running: false,
        lastError:
          apiResult.error
      });

      return {
        ok: false,
        error:
          apiResult.error
      };
    }

    const predictions =
      limitLeagues(
        groupPredictions(
          apiResult.fixtures
        )
      );

    if (
      !predictions.length
    ) {
      const msg = `Tidak ada pertandingan besar untuk tanggal ${targetDate}.`;

      await writeStatus({
        running: false,
        lastError: msg
      });

      return {
        ok: false,
        error: msg
      };
    }

    const title = `PREDIKSI PARLAY JITU MALAM INI ${prettyDateRange(
      targetDate
    )}`;

    let rows = force
      ? posts.filter(
          (p) =>
            !(
              p.autoGenerated &&
              p.autoDate ===
                targetDate
            )
        )
      : posts;

    const slug =
      await uniqueSlugForDate(
        title,
        rows
      );

    const content =
      contentFromPredictions(
        title,
        predictions
      );

    const now =
      new Date().toISOString();

    const totalMatches =
      predictions.reduce(
        (sum, row) =>
          sum +
          row.matches.length,
        0
      );

    const post = {
      id: `auto-${crypto
        .randomUUID()
        .slice(0, 8)}`,

      title,

      slug,

      category:
        "Prediksi Parlay",

      tags: [
        "Betting Bola",
        "Bola Hari Ini",
        "Liga Champions",
        "Premier League",
        "Prediksi Bola",
        "Tips Parlay"
      ],

      author:
        process.env
          .AUTO_PARLAY_AUTHOR ||
        "Master Parlay",

      thumbnail:
        DEFAULT_THUMBNAIL,

      excerpt:
        makeExcerpt(
          `Prediksi parlay malam ini berisi ${totalMatches} pertandingan pilihan dari liga besar dunia lengkap dengan prediksi skor dan 1X2.`
        ),

      content,

      published: true,

      autoGenerated: true,

      autoDate:
        targetDate,

      fixtureSource:
        "api-football",

      createdAt: now,

      updatedAt: now,

      predictions
    };

    rows.unshift(post);

    await savePosts(rows);

    await writeStatus({
      running: false,
      lastSuccessAt: now,
      lastCreatedSlug:
        slug,
      lastError: null
    });

    return {
      ok: true,
      skipped: false,
      post,
      totalMatches
    };
  } catch (err) {
    const error =
      err?.message ||
      String(err);

    await writeStatus({
      running: false,
      lastError: error
    }).catch(() => {});

    return {
      ok: false,
      error
    };
  } finally {
    running = false;
  }
}

export function startAutoParlayScheduler() {
  if (
    process.env
      .AUTO_PARLAY_ENABLED ===
    "false"
  ) {
    console.log(
      "[AUTO PARLAY] disabled"
    );

    return;
  }

  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  const scheduleNext =
    async () => {
      const delay =
        nextMidnightDelay();

      const nextRunAt =
        new Date(
          Date.now() +
            delay
        ).toISOString();

      await writeStatus({
        enabled: true,
        nextRunAt
      }).catch(() => {});

      timer = setTimeout(
        async () => {
          console.log(
            `[AUTO PARLAY] run at 00:00 ${TZ}`
          );

          await generateDailyParlay();

          scheduleNext();
        },
        delay
      );
    };

  scheduleNext();

  if (
    process.env
      .AUTO_PARLAY_RUN_ON_START ===
    "true"
  ) {
    setTimeout(
      async () => {
        await generateDailyParlay();
      },
      5000
    );
  }
}

export function stopAutoParlayScheduler() {
  if (timer) {
    clearTimeout(timer);
  }

  timer = null;
}
