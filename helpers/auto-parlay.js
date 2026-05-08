import crypto from "crypto";
import { readJson, writeJson } from "./json-db.js";
import { getPosts, savePosts } from "./store.js";
import { slugify, makeExcerpt } from "./slug.js";
import { getFixturesByDate, normalizeFixture } from "./football-api.js";

const TZ = process.env.AUTO_PARLAY_TIMEZONE || "Asia/Jakarta";
const STATUS_FILE = "auto-parlay-status.json";
const DEFAULT_THUMBNAIL = process.env.AUTO_PARLAY_THUMBNAIL_URL || "https://i.ibb.co/RTFBCzGc/image.png";

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
    date: `${parts.year}-${parts.month}-${parts.day}`,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function addDays(dateString, amount){
  const d = new Date(`${dateString}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0,10);
}

function nextMidnightDelay(){
  const p = nowParts();
  const msToday = ((p.hour * 60 + p.minute) * 60 + p.second) * 1000;
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.max(1000, oneDay - msToday + 1500);
}

function prettyDateRange(dateString){
  const monthNames = ["JANUARI","FEBRUARI","MARET","APRIL","MEI","JUNI","JULI","AGUSTUS","SEPTEMBER","OKTOBER","NOVEMBER","DESEMBER"];
  const [y,m,d] = dateString.split("-").map(Number);
  const next = addDays(dateString, 1);
  const [ny,nm,nd] = next.split("-").map(Number);
  if (m === nm && y === ny) return `${String(d).padStart(2,"0")} – ${String(nd).padStart(2,"0")} ${monthNames[m-1]} ${y}`;
  return `${String(d).padStart(2,"0")} ${monthNames[m-1]} ${y} – ${String(nd).padStart(2,"0")} ${monthNames[nm-1]} ${ny}`;
}

function hashNum(text){
  const hex = crypto.createHash("sha256").update(String(text)).digest("hex").slice(0,8);
  return parseInt(hex, 16);
}

function predictMatch(fixture){
  const seed = hashNum(`${fixture.id}-${fixture.home}-${fixture.away}-${fixture.date}`);
  const homePower = 45 + (hashNum(`${fixture.home}-home`) % 55);
  const awayPower = 45 + (hashNum(`${fixture.away}-away`) % 55);
  const homeBoost = 8 + (seed % 7);
  const diff = (homePower + homeBoost) - awayPower;

  let pick = "X";
  if (diff > 9) pick = "1";
  if (diff < -6) pick = "2";

  let homeGoals = 1 + (seed % 3);
  let awayGoals = 1 + ((seed >> 3) % 3);

  if (pick === "1" && homeGoals <= awayGoals) homeGoals = awayGoals + 1;
  if (pick === "2" && awayGoals <= homeGoals) awayGoals = homeGoals + 1;
  if (pick === "X") {
    const g = (seed % 2) + 1;
    homeGoals = g;
    awayGoals = g;
  }

  homeGoals = Math.min(homeGoals, 4);
  awayGoals = Math.min(awayGoals, 4);

  const ou = (homeGoals + awayGoals) >= 3 ? "OVER" : "UNDER";

  return {
    match: `${fixture.home} vs ${fixture.away}`,
    pick,
    ou,
    score: `${homeGoals} – ${awayGoals}`,
    time: fixture.date,
    fixtureId: fixture.id
  };
}

function groupPredictions(fixtures){
  const grouped = new Map();
  for (const raw of fixtures) {
    const f = normalizeFixture(raw);
    if (["FT", "AET", "PEN", "PST", "CANC", "ABD", "AWD", "WO"].includes(f.status)) continue;
    const item = predictMatch(f);
    if (!grouped.has(f.league)) grouped.set(f.league, []);
    grouped.get(f.league).push(item);
  }

  return [...grouped.entries()].map(([league, matches]) => ({
    league,
    matches: matches.slice(0, Number(process.env.AUTO_PARLAY_MAX_MATCHES_PER_LEAGUE || 12))
  })).filter(x => x.matches.length);
}

function limitLeagues(predictions){
  const maxLeagues = Number(process.env.AUTO_PARLAY_MAX_LEAGUES || 14);
  const maxMatches = Number(process.env.AUTO_PARLAY_MAX_MATCHES || 50);
  const result = [];
  let count = 0;

  for (const league of predictions) {
    if (result.length >= maxLeagues || count >= maxMatches) break;
    const left = maxMatches - count;
    const matches = league.matches.slice(0, left);
    if (matches.length) {
      result.push({ league: league.league, matches });
      count += matches.length;
    }
  }

  return result;
}

function contentFromPredictions(title, predictions){
  const leagueNames = predictions.slice(0, 6).map(p => p.league).join(", ");
  const total = predictions.reduce((sum, row) => sum + row.matches.length, 0);

  return `
<p><a href="/prediksi-parlay">Prediksi Parlay</a> malam ini menyajikan rangkuman pertandingan pilihan yang akan bermain hari ini. Data pertandingan disusun otomatis dari jadwal bola terbaru, lalu dirapikan menjadi tabel liga agar mudah dibaca.</p>
<p>Artikel <strong>${title}</strong> memuat ${total} pertandingan dari beberapa kompetisi, termasuk ${leagueNames || "liga pilihan hari ini"}. Setiap pertandingan dilengkapi pilihan 1X2, over/under, dan perkiraan skor.</p>
<p>Gunakan informasi ini sebagai bahan analisa tambahan. Hasil pertandingan tetap dapat berubah karena faktor performa pemain, rotasi tim, jadwal padat, kondisi lapangan, dan keputusan pelatih.</p>
`;
}

async function writeStatus(update){
  const current = await readJson(STATUS_FILE, {
    enabled: true,
    running:false,
    lastRunAt:null,
    lastSuccessAt:null,
    lastError:null,
    lastCreatedSlug:null,
    nextRunAt:null
  });
  const next = { ...current, ...update };
  await writeJson(STATUS_FILE, next);
  return next;
}

async function uniqueSlugForDate(title, posts){
  const base = slugify(title);
  let slug = base;
  let i = 2;
  while (posts.some(p => p.slug === slug)) slug = `${base}-${i++}`;
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
  if (running) {
    return { ok:false, skipped:true, message:"Auto parlay sedang berjalan." };
  }

  running = true;
  const runAt = new Date().toISOString();
  await writeStatus({ running:true, lastRunAt:runAt, lastError:null });

  try {
    const targetDate = date || nowParts().date;
    const posts = await getPosts({ includeDrafts:true });
    const existing = posts.find(p => p.autoGenerated && p.autoDate === targetDate);

    if (existing && !force) {
      await writeStatus({ running:false, lastSuccessAt:runAt, lastCreatedSlug:existing.slug, lastError:null });
      return { ok:true, skipped:true, post:existing, message:"Post otomatis hari ini sudah ada." };
    }

    const apiResult = await getFixturesByDate(targetDate);
    if (!apiResult.ok) {
      await writeStatus({ running:false, lastError:apiResult.error });
      return { ok:false, error:apiResult.error };
    }

    const predictions = limitLeagues(groupPredictions(apiResult.fixtures));
    if (!predictions.length) {
      const msg = `Tidak ada pertandingan baru untuk tanggal ${targetDate}.`;
      await writeStatus({ running:false, lastError:msg });
      return { ok:false, error:msg };
    }

    const title = `PREDIKSI PARLAY JITU MALAM INI ${prettyDateRange(targetDate)}`;
    let rows = force ? posts.filter(p => !(p.autoGenerated && p.autoDate === targetDate)) : posts;
    const slug = await uniqueSlugForDate(title, rows);
    const content = contentFromPredictions(title, predictions);
    const now = new Date().toISOString();
    const totalMatches = predictions.reduce((sum, row) => sum + row.matches.length, 0);

    const post = {
      id:`auto-${crypto.randomUUID().slice(0,8)}`,
      title,
      slug,
      category:"Prediksi Parlay",
      tags:["Betting Bola", "Bola Hari Ini", "Bola Online", "Pasaran Bola", "Prediksi Bola", "Prediksi Pertandingan", "Tips Prediksi"],
      author: process.env.AUTO_PARLAY_AUTHOR || "Master Parlay",
      thumbnail: DEFAULT_THUMBNAIL,
      excerpt: makeExcerpt(`Prediksi parlay otomatis hari ini berisi ${totalMatches} pertandingan pilihan lengkap dengan 1X2, over/under, dan perkiraan skor.`),
      content,
      published:true,
      autoGenerated:true,
      autoDate:targetDate,
      fixtureSource:"api-football",
      createdAt:now,
      updatedAt:now,
      predictions
    };

    rows.unshift(post);
    await savePosts(rows);
    await writeStatus({ running:false, lastSuccessAt:now, lastCreatedSlug:slug, lastError:null });

    return { ok:true, skipped:false, post, totalMatches };
  } catch (err) {
    const error = err?.message || String(err);
    await writeStatus({ running:false, lastError:error });
    return { ok:false, error };
  } finally {
    running = false;
  }
}

export function startAutoParlayScheduler(){
  if (process.env.AUTO_PARLAY_ENABLED === "false") {
    console.log("[AUTO PARLAY] disabled by AUTO_PARLAY_ENABLED=false");
    return;
  }

  const scheduleNext = async () => {
    const delay = nextMidnightDelay();
    const nextRunAt = new Date(Date.now() + delay).toISOString();
    await writeStatus({ enabled:true, nextRunAt }).catch(()=>{});

    timer = setTimeout(async () => {
      console.log(`[AUTO PARLAY] run at 00:00 ${TZ}`);
      await generateDailyParlay();
      scheduleNext();
    }, delay);
  };

  scheduleNext();

  if (process.env.AUTO_PARLAY_RUN_ON_START === "true") {
    setTimeout(() => generateDailyParlay(), 5000);
  }
}

export function stopAutoParlayScheduler(){
  if (timer) clearTimeout(timer);
  timer = null;
}
