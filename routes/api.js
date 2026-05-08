import express from "express";
import axios from "axios";
import { generateDailyParlay, getAutoParlayStatus } from "../helpers/auto-parlay.js";

const router = express.Router();

function canRunAutoParlay(req){
  if (req.session?.isAdmin) return true;
  const secret = process.env.AUTO_PARLAY_SECRET || process.env.ADMIN_PASSWORD || "";
  const given = req.headers["x-auto-parlay-secret"] || req.query.secret || "";
  return Boolean(secret && given && String(given) === String(secret));
}

router.get("/api/auto-parlay/status", async (_req, res) => {
  const status = await getAutoParlayStatus();
  res.json(status);
});

router.post("/api/auto-parlay/run", async (req, res) => {
  if (!canRunAutoParlay(req)) return res.status(403).json({ ok:false, error:"Forbidden" });
  const result = await generateDailyParlay({ force: req.query.force === "true" || req.body?.force === true, date: req.query.date || req.body?.date || null });
  res.status(result.ok ? 200 : 500).json(result);
});

router.get("/api/auto-parlay/run", async (req, res) => {
  if (!canRunAutoParlay(req)) return res.status(403).json({ ok:false, error:"Forbidden" });
  const result = await generateDailyParlay({ force: req.query.force === "true", date: req.query.date || null });
  res.status(result.ok ? 200 : 500).json(result);
});


// ---- Config ----
const API = "https://v3.football.api-sports.io";
const KEY = process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY; // <== set di Railway
const SEASON = process.env.SEASON || "2025";
const CACHE_TTL = Number(process.env.CACHE_TTL || 300); // detik (default 5 menit)

// === MODE WHITELIST (opsional) ===
const WHITELIST_MODE = (process.env.WHITELIST_MODE || "off").toLowerCase() === "on";

// =================== WHITELIST LABELS (dipakai hanya jika WHITELIST_MODE=on) ===================
const WL_LABELS_RAW = `
ENGLISH PREMIER LEAGUE
SPAIN LA LIGA
ITALY SERIE A
GERMANY BUNDESLIGA
FRANCE LIGUE 1
INDONESIA SUPER LEAGUE
ENGLISH CHAMPIONSHIP
NETHERLANDS EREDIVISIE
PORTUGAL LIGA PORTUGAL
SCOTLAND PREMIERSHIP
BELGIUM FIRST DIVISION A
TURKIYE SUPER LEAGUE
SAUDI ARABIA PRO LEAGUE
USA MAJOR LEAGUE SOCCER
ARGENTINA LIGA PROFESIONAL
BRAZIL SERIE A
MEXICO PRIMERA DIVISION
JAPAN J1 LEAGUE
KOREA K-LEAGUE 1
CHINA FOOTBALL SUPER LEAGUE
UKRAINE PREMIER LEAGUE
RUSSIA PREMIER LEAGUE
AUSTRIA BUNDESLIGA
SWISS SUPER LEAGUE
GERMANY BUNDESLIGA 2
ITALY SERIE B
FRANCE LIGUE 2
DENMARK SUPER LEAGUE
NORWAY ELITESERIEN
SWEDEN ALLSVENSKAN
POLAND EKSTRAKLASA
SCOTLAND CHAMPIONSHIP
ENGLISH LEAGUE ONE
ENGLISH LEAGUE TWO
UAE PRO LEAGUE
QATAR STARS LEAGUE
CANADIAN PREMIER LEAGUE
COLOMBIA PRIMERA A
ECUADOR LIGA PRO SERIE A
PARAGUAY PRIMERA DIVISION
PERU LIGA 1
URUGUAY PRIMERA DIVISION
MEXICO LIGA DE EXPANSION
USL CHAMPIONSHIP
CZECHIA FIRST LEAGUE
HUNGARY LIGA NB 1
ROMANIA SUPERLIGA
SLOVENIA PRVA LIGA
SLOVAKIA SUPER LEAGUE
CROATIA SUPERLIGA
ISRAEL PREMIER LEAGUE
WALES PREMIER LEAGUE
SOUTH AFRICA PREMIERSHIP
NORTHERN IRELAND PREMIERSHIP
FINLAND YKKOSLIIGA
SWEDEN SUPERETTAN
NORWAY 1ST DIV
DENMARK 1ST DIV
POLAND 1ST LIGA
GERMANY 3RD LEAGUE
AUSTRIA 2ND LIGA
ENGLISH NATIONAL LEAGUE
ENGLISH NATIONAL LEAGUE NORTH
SCOTLAND LEAGUE 1
SCOTLAND LEAGUE 2
JAPAN J2 LEAGUE
JAPAN J3 LEAGUE
KOREA K-LEAGUE 2
THAILAND LEAGUE 1
MOROCCO BOTOLA PRO
ALGERIA PROFESSIONAL LIGUE 1
LATVIA VIRSLIGA
BELARUS PREMIER LEAGUE
GEORGIA EROVNULI LIGA
AZERBAIJAN PREMIER LEAGUE
CYPRUS 1ST DIV
CZECHIA NATIONAL FOOTBALL LEAGUE
BELGIUM FIRST DIVISION B
ARGENTINA PRIMERA NACIONAL
URUGUAY SEGUNDA DIVISION
VENEZUELA PRIMERA DIVISION
MEXICO WOMEN PRIMERA DIVISION
SWEDEN WOMEN DAMALLSVENSKAN
USA WOMEN NWSL
UEFA CHAMPIONS LEAGUE
UEFA EUROPA LEAGUE
UEFA EUROPA CONFERENCE LEAGUE
ENGLISH FA CUP
ENGLISH EFL CUP
COPA LIBERTADORES
COPA SUDAMERICANA
`.trim().split("\n").map(s => s.trim()).filter(Boolean);

// =================== UTIL & CACHE ===================
const cache = new Map();
const getC = (k) => {
  const d = cache.get(k);
  if (!d) return null;
  if (Date.now() > d.exp) { cache.delete(k); return null; }
  return d.val;
};
const setC = (k, val, ttlSec) => cache.set(k, { val, exp: Date.now() + ttlSec * 1000 });

const norm = (s="") => s
  .toString()
  .normalize("NFD").replace(/\p{Diacritic}/gu, "")
  .replace(/[^A-Za-z0-9]+/g, " ")
  .trim()
  .toUpperCase();

async function apiGet(pathUrl, params) {
  const { data } = await axios.get(`${API}${pathUrl}`, {
    headers: { "x-apisports-key": KEY },
    params
  });
  return data?.response || [];
}

// =================== PRIORITY ORDER (LEAGUE TOP DI ATAS) ===================
const PRIORITY_IDS = (process.env.PRIORITY_IDS || "")
  .split(",").map(s=>s.trim()).filter(Boolean).map(Number);
const PRIORITY_ID_RANK = new Map(PRIORITY_IDS.map((id,i)=>[id,i]));
const PRIORITY_ID_SET = new Set(PRIORITY_IDS);

const PRIORITY_LABELS = [
  "UEFA CHAMPIONS LEAGUE",
  "UEFA EUROPA LEAGUE",
  "UEFA EUROPA CONFERENCE LEAGUE",
  "ENGLISH PREMIER LEAGUE",
  "SPAIN LA LIGA",
  "ITALY SERIE A",
  "GERMANY BUNDESLIGA",
  "FRANCE LIGUE 1",
  "INDONESIA SUPER LEAGUE",
  "SAUDI ARABIA PRO LEAGUE",
  "JAPAN J1 LEAGUE",
  "KOREA K-LEAGUE 1",
  "CHINA FOOTBALL SUPER LEAGUE",
  "TURKIYE SUPER LEAGUE",
  "PORTUGAL LIGA PORTUGAL",
  "NETHERLANDS EREDIVISIE",
  "BELGIUM FIRST DIVISION A",
  "SCOTLAND PREMIERSHIP",
  "AUSTRIA BUNDESLIGA",
  "SWISS SUPER LEAGUE",
  "ARGENTINA LIGA PROFESIONAL",
  "BRAZIL SERIE A",
  "MEXICO PRIMERA DIVISION",
  "USA MAJOR LEAGUE SOCCER",
  "ENGLISH CHAMPIONSHIP",
  "GERMANY BUNDESLIGA 2",
  "ITALY SERIE B",
  "FRANCE LIGUE 2",
  "ENGLISH FA CUP",
  "ENGLISH EFL CUP",
  "COPA LIBERTADORES",
  "COPA SUDAMERICANA",
];
const PRIO_LABEL_RANK = new Map(PRIORITY_LABELS.map((s,i)=>[norm(s), i]));

// =================== STARTUP: MAP LABEL → LEAGUE IDs (untuk whitelist mode) ===================
let ALLOWED_LEAGUE_IDS = new Set();
let WHITELIST_DEBUG = [];

const SYN = new Map([
  ["INDONESIA SUPER LEAGUE", ["INDONESIA LIGA 1", "INDONESIA LIGA1", "LIGA 1"]],
  ["TURKIYE SUPER LEAGUE", ["TURKIYE SUPER LIG", "TURKEY SUPER LIG", "SUPER LIG"]],
  ["SAUDI ARABIA PRO LEAGUE", ["SAUDI PRO LEAGUE"]],
  ["SPAIN LA LIGA", ["LA LIGA", "PRIMERA DIVISION"]],
  ["ENGLISH PREMIER LEAGUE", ["PREMIER LEAGUE"]],
  ["GERMANY BUNDESLIGA", ["BUNDESLIGA"]],
  ["FRANCE LIGUE 1", ["LIGUE 1"]],
  ["FRANCE LIGUE 2", ["LIGUE 2"]],
  ["DENMARK SUPER LEAGUE", ["DENMARK SUPERLIGA", "SUPERLIGA"]],
  ["SLOVAKIA SUPER LEAGUE", ["SLOVAKIA SUPERLIGA"]],
  ["CZECHIA FIRST LEAGUE", ["CZECH FIRST LEAGUE"]],
  ["BELGIUM FIRST DIVISION A", ["BELGIUM JULIPER PRO LEAGUE", "BELGIUM PRO LEAGUE"]],
  ["BELGIUM FIRST DIVISION B", ["BELGIUM CHALLENGER PRO LEAGUE"]],
  ["POLAND EKSTRAKLASA", ["EKSTRAKLASA"]],
  ["POLAND 1ST LIGA", ["I LIGA", "1 LIGA"]],
  ["NORWAY 1ST DIV", ["NORWAY OBOS LIGAEN", "OBOS LIGAEN"]],
  ["DENMARK 1ST DIV", ["1ST DIVISION"]],
  ["GERMANY 3RD LEAGUE", ["3 LIGA", "3. LIGA"]],
  ["AUSTRIA 2ND LIGA", ["2 LIGA"]],
  ["HUNGARY LIGA NB 1", ["NB I", "OTP BANK LIGA"]],
  ["USA MAJOR LEAGUE SOCCER", ["MAJOR LEAGUE SOCCER", "MLS"]],
  ["MEXICO PRIMERA DIVISION", ["LIGA MX"]],
  ["MEXICO LIGA DE EXPANSION", ["LIGA DE EXPANSION MX"]],
  ["ARGENTINA LIGA PROFESIONAL", ["LIGA PROFESIONAL"]],
  ["CANADIAN PREMIER LEAGUE", ["CANADA PREMIER LEAGUE"]],
  ["SWEDEN WOMEN DAMALLSVENSKAN", ["DAMALLSVENSKAN"]],
  ["UEFA CHAMPIONS LEAGUE", ["UEFA CL"]],
  ["UEFA EUROPA LEAGUE", ["UEFA EL"]],
  ["UEFA EUROPA CONFERENCE LEAGUE", ["UEFA ECL"]],
  ["ENGLISH FA CUP", ["FA CUP"]],
  ["ENGLISH EFL CUP", ["EFL CUP","CARABAO CUP"]],
  ["COPA LIBERTADORES", ["LIBERTADORES"]],
  ["COPA SUDAMERICANA", ["SUDAMERICANA"]],
]);

async function buildWhitelist() {
  if (!WHITELIST_MODE) {
    ALLOWED_LEAGUE_IDS = new Set();
    WHITELIST_DEBUG = [];
    console.log("[Whitelist] mode OFF (include all leagues)");
    return;
  }
  try {
    const allLeagues = await apiGet("/leagues");
    const labelsNorm = WL_LABELS_RAW.map(norm);
    const expands = (label) => {
      const arr = [label];
      const syns = SYN.get(label);
      if (syns) arr.push(...syns.map(norm));
      return arr;
    };
    const wanted = new Set();
    for (const L of labelsNorm) expands(norm(L)).forEach(x => wanted.add(x));
    const matched = [];
    const ids = new Set();
    for (const item of allLeagues) {
      const name = norm(item.league?.name || "");
      const country = norm(item.country?.name || "");
      const combo = `${country} ${name}`.trim();
      const candidates = [name, combo];
      let ok = false;
      for (const c of candidates) {
        if (wanted.has(c)) { ok = true; break; }
        for (const w of wanted) {
          if (c.includes(w) || w.includes(c)) { ok = true; break; }
        }
        if (ok) break;
      }
      if (ok) {
        const hasSeason = Array.isArray(item.seasons)
          ? item.seasons.some(s => `${s.year}` === `${SEASON}`)
          : true;
        if (hasSeason) {
          ids.add(item.league.id);
          matched.push({
            id: item.league.id,
            name: item.league.name,
            country: item.country?.name || "",
          });
        }
      }
    }
    ALLOWED_LEAGUE_IDS = ids;
    WHITELIST_DEBUG = matched.sort((a,b)=> (a.country+a.name).localeCompare(b.country+b.name));
    console.log(`[Whitelist] mode ON, leagues mapped: ${ALLOWED_LEAGUE_IDS.size}`);
  } catch (e) {
    console.error("[Whitelist] build failed:", e?.response?.data || e.message);
    ALLOWED_LEAGUE_IDS = new Set();
  }
}
await buildWhitelist();
setInterval(buildWhitelist, 24 * 60 * 60 * 1000);

// =================== PRIORITY HELPER ===================
function leagueWeight(g) {
  if (PRIORITY_ID_SET.size && PRIORITY_ID_SET.has(g.id)) {
    return PRIORITY_ID_RANK.get(g.id) ?? 0;
  }
  const nTitle = norm(g.rawTitle || g.title || "");
  const nCombo = norm(`${g.country || ""} ${g.rawTitle || g.title || ""}`);
  if (PRIO_LABEL_RANK.has(nTitle)) return PRIO_LABEL_RANK.get(nTitle);
  if (PRIO_LABEL_RANK.has(nCombo)) return PRIO_LABEL_RANK.get(nCombo);
  for (const [label, syns] of SYN.entries()) {
    const nLabel = norm(label);
    const bag = new Set([nLabel, ...(syns||[]).map(norm)]);
    if (bag.has(nTitle) || bag.has(nCombo)) {
      return PRIO_LABEL_RANK.get(nLabel) ?? 999;
    }
  }
  return 999;
}

// =================== DATA & PREDIKSI (tetap) ===================
function toWIB(iso) {
  try {
    const d = new Date(iso);
    const hm = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).format(d);
    const dm = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit" }).format(d);
    return `${dm} ${hm} WIB`;
  } catch { return "-"; }
}

async function getFixturesAll(date) {
  const ck = `fxall:${date}`;
  const c = getC(ck); if (c) return c;
  const resp = await apiGet("/fixtures", { date });
  const out = resp.map(m => ({ league: m.league, fixture: m.fixture, teams: m.teams, goals: m.goals }));
  setC(ck, out, CACHE_TTL);
  return out;
}

async function getStandings(league, season) {
  const ck = `std:${league}:${season}`;
  const c = getC(ck); if (c) return c;
  try {
    const resp = await apiGet("/standings", { league, season });
    const table = (((resp[0] || {}).league || {}).standings || [])[0] || [];
    const map = {};
    for (const row of table) map[row.team.id] = row.rank;
    setC(ck, map, 3600);
    return map;
  } catch {
    setC(ck, {}, 600);
    return {};
  }
}

function predictFromRanks(homeId, awayId, rankMap) {
  const hasRank = rankMap && Object.keys(rankMap).length;
  const rh = hasRank ? (rankMap[homeId] || 20) : 20;
  const ra = hasRank ? (rankMap[awayId] || 20) : 22;
  const diff = ra - rh;
  const k = 6;
  let pHome = 1 / (1 + Math.exp(-diff / k)) + 0.05;
  pHome = Math.min(Math.max(pHome, 0.05), 0.9);
  const pDraw = 0.18 * Math.exp(-Math.abs(diff) / 6);
  let pAway = 1 - pHome - pDraw;
  if (pAway < 0.05) { pAway = 0.05; pHome = 1 - pDraw - pAway; }
  let tip = "Draw", conf = Math.round(pDraw * 100);
  if (pHome >= pAway && pHome >= pDraw) { tip = "Home"; conf = Math.round(pHome * 100); }
  if (pAway >= pHome && pAway >= pDraw) { tip = "Away"; conf = Math.round(pAway * 100); }
  return { tip, conf };
}

function estimateScoreFromTip(matchLabel, tip, confidence) {
  const [home] = (matchLabel || "").split(" vs ");
  const c = Math.max(0, Math.min(100, Number(confidence ?? 50)));
  const flip = s => { const [a,b]=s.split("-").map(v=>v.trim()); return `${b} - ${a}`; };
  if (tip === "Draw") {
    if (c >= 75) return "1 - 1";
    if (c >= 55) return "0 - 0";
    return "1 - 1";
  }
  let s = "1 - 0";
  if (c >= 85) s = "3 - 1";
  else if (c >= 75) s = "2 - 0";
  else if (c >= 65) s = "2 - 1";
  if (tip !== home) s = flip(s);
  return s;
}

/* ==== Big match scoring (internal) ==== */
const BIG_TEAMS = [
  'Real Madrid','Barcelona','Atlético','Atletico',
  'Manchester City','Manchester United','Liverpool','Arsenal','Chelsea','Tottenham',
  'Bayern','Borussia Dortmund','Dortmund','PSG',
  'Inter','AC Milan','Juventus','Napoli',
  'Ajax','PSV','Benfica','Porto'
];
const ID_TEAMS = [
  'Persib','Persija','Persebaya','Arema','Bali United','PSM','Persik','Dewa United',
  'Madura United','Borneo','Persita','Barito Putera'
];
const HOT_KEYWORDS = ['derby','clasico','el clasico','superclasico'];
function matchPriorityFromLabel(label='') {
  const m = label.toLowerCase();
  let sc = 0;
  BIG_TEAMS.forEach(t => { if (m.includes(t.toLowerCase())) sc += 10; });
  ID_TEAMS.forEach(t => { if (m.includes(t.toLowerCase())) sc += 6; });
  HOT_KEYWORDS.forEach(k => { if (m.includes(k)) sc += 4; });
  return sc;
}

// =================== API: Prediksi (original + tambah IDs utk H2H) ===================
router.get("/api/fixtures", async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0,10);
    const season = req.query.season || SEASON;

    const fixtures = await getFixturesAll(date);
    const useFilter = WHITELIST_MODE && ALLOWED_LEAGUE_IDS.size > 0;
    const list = useFilter ? fixtures.filter(fx => ALLOWED_LEAGUE_IDS.has(fx.league?.id)) : fixtures;

    const byLeague = new Map();
    for (const m of list) {
      const key = m.league?.id || 0;
      if (!byLeague.has(key)) {
        byLeague.set(key, {
          id: key,
          rawTitle: m.league?.name || "League",
          country: m.league?.country || "",
          flag: m.league?.flag || null,
          rows: []
        });
      }
      byLeague.get(key).rows.push(m);
    }

    const groups = [];
    for (const [leagueId, info] of byLeague) {
      const rankMap = await getStandings(leagueId, season).catch(()=> ({}));
      let rows = (info.rows || []).map(m => {
        const h = m.teams.home, a = m.teams.away;
        const match = `${h.name} vs ${a.name}`;
        const pred = predictFromRanks(h.id, a.id, rankMap);
        const tipName = pred.tip === "Home" ? h.name : pred.tip === "Away" ? a.name : "Draw";
        return {
          fixtureId: m.fixture.id,              // <-- TAMBAHAN
          homeId: h.id,                         // <-- TAMBAHAN
          awayId: a.id,                         // <-- TAMBAHAN
          kickoff: toWIB(m.fixture.date),
          match,
          score: `${m.goals.home ?? "-"} - ${m.goals.away ?? "-"}`,
          tip: tipName,
          confidence: pred.conf,
          predictedScore: estimateScoreFromTip(match, tipName, pred.conf),
          _prio: matchPriorityFromLabel(match)
        };
      });
      rows.sort((r1, r2) => (r2._prio || 0) - (r1._prio || 0));
      rows = rows.map(({ _prio, ...rest }) => rest);

      const displayTitle = `${(info.country || "").toUpperCase()} - ${info.rawTitle}`.trim();
      groups.push({
        id: leagueId,
        rawTitle: info.rawTitle,
        country: info.country,
        flag: info.flag,
        displayTitle,
        rows
      });
    }

    groups.sort((a, b) => {
      const wa = leagueWeight(a);
      const wb = leagueWeight(b);
      if (wa !== wb) return wa - wb;
      return (a.displayTitle || "").localeCompare(b.displayTitle || "");
    });

    const out = groups.map(g => ({
      id: g.id,
      title: g.displayTitle,
      country: g.country,
      flag: g.flag,
      rows: g.rows
    }));
    res.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    res.json({ date, groups: out, filtered: useFilter });
  } catch (e) {
    res.status(e?.response?.status || 500).json({ ok:false, status:e?.response?.status, data:e?.response?.data, message:e.message });
  }
});

// =================== API: LIVE ===================
const LIVE_CACHE_TTL_MS = Number(process.env.LIVE_CACHE_TTL_MS || 30000);
let liveCache = { at: 0, data: null };
let matchCache = new Map(); // fixtureId -> {at, data}

function prioLeagueName(name = "") {
  const T = norm(name);
  const idx = PRIORITY_LABELS.findIndex(lbl => T.includes(norm(lbl)));
  if (idx !== -1) return 1 + idx;
  if (T.includes("INDONESIA") || T.includes("LIGA 1")) return 100;
  return 1000;
}

router.get("/api/live", async (_req, res) => {
  try {
    const now = Date.now();
    if (liveCache.data && now - liveCache.at < LIVE_CACHE_TTL_MS) {
      return res.json(liveCache.data);
    }
    const { data } = await axios.get(`${API}/fixtures`, {
      headers: { "x-apisports-key": KEY }, params: { live: "all" }
    });
    const rows = (data?.response || []).map(it => {
      const leagueName = `${(it.league?.country || "").toUpperCase()} - ${it.league?.name || ""}`.trim();
      const home = it.teams?.home?.name || "Home";
      const away = it.teams?.away?.name || "Away";
      const gh = it.goals?.home ?? it.score?.fulltime?.home ?? 0;
      const ga = it.goals?.away ?? it.score?.fulltime?.away ?? 0;
      const short = it.fixture?.status?.short || "";
      const elapsed = it.fixture?.status?.elapsed;
      const time = (typeof elapsed === "number" && elapsed >= 0) ? `${elapsed}'` : short || "LIVE";
      return {
        id: it.fixture?.id,
        league: leagueName,
        leagueId: it.league?.id,
        season: it.league?.season,
        flag: it.league?.flag || null,
        homeId: it.teams?.home?.id,
        awayId: it.teams?.away?.id,
        match: `${home} vs ${away}`,
        score: `${gh} - ${ga}`,
        time
      };
    });

    rows.sort((a,b) => {
      const pa = prioLeagueName(a.league);
      const pb = prioLeagueName(b.league);
      if (pa !== pb) return pa - pb;
      const ma = parseInt(a.time) || 0;
      const mb = parseInt(b.time) || 0;
      return mb - ma;
    });

    const payload = { rows };
    liveCache = { at: Date.now(), data: payload };
    res.json(payload);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: true, message: e?.response?.data || e.message });
  }
});

// =================== API: FINISHED (FT) ===================
const FINISHED_CACHE_TTL_MS = Number(process.env.FINISHED_CACHE_TTL_MS || 120000);
let finishedCache = { at: 0, data: null };

router.get("/api/finished", async (req, res) => {
  try {
    const now = Date.now();
    if (finishedCache.data && now - finishedCache.at < FINISHED_CACHE_TTL_MS) {
      return res.json(finishedCache.data);
    }

    const date = req.query.date || new Date().toISOString().slice(0,10);
    const { data } = await axios.get(`${API}/fixtures`, {
      headers: { "x-apisports-key": KEY },
      params: { date }
    });

    const FIN_CODES = new Set(["FT","AET","PEN"]);
    const rows = (data?.response || [])
      .filter(it => FIN_CODES.has((it.fixture?.status?.short || "").toUpperCase()))
      .map(it => {
        const leagueName = `${(it.league?.country || "").toUpperCase()} - ${it.league?.name || ""}`.trim();
        const home = it.teams?.home?.name || "Home";
        const away = it.teams?.away?.name || "Away";
        const gh = it.goals?.home ?? it.score?.fulltime?.home ?? 0;
        const ga = it.goals?.away ?? it.score?.fulltime?.away ?? 0;
        return {
          id: it.fixture?.id,
          league: leagueName,
          leagueId: it.league?.id,
          flag: it.league?.flag || null,
          match: `${home} vs ${away}`,
          score: `${gh} - ${ga}`,
          status: it.fixture?.status?.short || "FT"
        };
      });

    rows.sort((a,b) => (a.league||"").localeCompare(b.league||"") || (a.match||"").localeCompare(b.match||""));

    const payload = { date, rows };
    finishedCache = { at: Date.now(), data: payload };
    res.json(payload);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: true, message: e?.response?.data || e.message });
  }
});

// =================== API: UPCOMING (jadwal terdekat) ===================
const UPCOMING_CACHE_TTL_MS = Number(process.env.UPCOMING_CACHE_TTL_MS || 60000);
let upcomingCache = { at: 0, key: "", data: null };

function minutesUntil(iso) {
  try {
    const kick = new Date(iso).getTime();
    const now = Date.now();
    return Math.round((kick - now) / 60000);
  } catch { return null; }
}

router.get("/api/upcoming", async (req, res) => {
  try {
    const hours = Math.max(1, Math.min(48, Number(req.query.hours || 12))); // default 12 jam
    const key = `h${hours}`;
    const now = Date.now();

    if (upcomingCache.data && upcomingCache.key === key && now - upcomingCache.at < UPCOMING_CACHE_TTL_MS) {
      return res.json(upcomingCache.data);
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth()+1).padStart(2,'0');
    const dd = String(today.getDate()).padStart(2,'0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const tomorrow = new Date(today.getTime() + 24*3600*1000);
    const yyyy2 = tomorrow.getFullYear();
    const mm2 = String(tomorrow.getMonth()+1).padStart(2,'0');
    const dd2 = String(tomorrow.getDate()).padStart(2,'0');
    const tomorrowStr = `${yyyy2}-${mm2}-${dd2}`;

    const [r1, r2] = await Promise.all([
      axios.get(`${API}/fixtures`, { headers: { "x-apisports-key": KEY }, params: { date: todayStr } }),
      axios.get(`${API}/fixtures`, { headers: { "x-apisports-key": KEY }, params: { date: tomorrowStr } }),
    ]);
    const all = [...(r1.data?.response||[]), ...(r2.data?.response||[])];

    const withinMs = hours * 3600 * 1000;
    const rows = all
      .filter(it => (it.fixture?.status?.short || "").toUpperCase() === "NS")
      .map(it => {
        const kickIso = it.fixture?.date;
        const mins = minutesUntil(kickIso);
        return { it, mins, kickIso };
      })
      .filter(x => x.mins !== null && x.mins >= 0 && x.mins*60000 <= withinMs)
      .sort((a,b) => a.mins - b.mins)
      .map(({ it, mins, kickIso }) => {
        const leagueName = `${(it.league?.country || "").toUpperCase()} - ${it.league?.name || ""}`.trim();
        const home = it.teams?.home?.name || "Home";
        const away = it.teams?.away?.name || "Away";
        return {
          id: it.fixture?.id,
          league: leagueName,
          leagueId: it.league?.id,
          flag: it.league?.flag || null,
          match: `${home} vs ${away}`,
          kickoff: toWIB(kickIso),
          in: mins
        };
      });

    const payload = { hours, rows };
    upcomingCache = { at: Date.now(), key, data: payload };
    res.json(payload);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: true, message: e?.response?.data || e.message });
  }
});

// =================== API: HEAD TO HEAD (baru) ===================
router.get("/api/h2h", async (req, res) => {
  try {
    const home = Number(req.query.home);
    const away = Number(req.query.away);
    const last = Math.max(1, Math.min(10, Number(req.query.last || 5)));
    if (!home || !away) return res.status(400).json({ error:true, message:"missing home/away" });

    const { data } = await axios.get(`${API}/fixtures/headtohead`, {
      headers: { "x-apisports-key": KEY },
      params: { h2h: `${home}-${away}`, last }
    });

    const rows = (data?.response || []).map(it => ({
      id: it.fixture?.id,
      date: it.fixture?.date,
      league: `${(it.league?.country || "").toUpperCase()} - ${it.league?.name || ""}`.trim(),
      flag: it.league?.flag || null,
      home: it.teams?.home?.name || "Home",
      away: it.teams?.away?.name || "Away",
      score: `${it.goals?.home ?? it.score?.fulltime?.home ?? 0} - ${it.goals?.away ?? it.score?.fulltime?.away ?? 0}`,
      winner: it.teams?.home?.winner ? "HOME" : it.teams?.away?.winner ? "AWAY" : "DRAW"
    })).sort((a,b)=> new Date(b.date) - new Date(a.date));

    res.json({ home, away, last, rows });
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error:true, message: e?.response?.data || e.message });
  }
});

router.get("/api/match/:id", async (req, res) => {
  const fixtureId = Number(req.params.id);
  if (!fixtureId) return res.status(400).json({ error: true, message: "invalid id" });
  const now = Date.now();
  const cached = matchCache.get(fixtureId);
  if (cached && now - cached.at < 25000) return res.json(cached.data);

  try {
    const fix = await apiGet("/fixtures", { id: fixtureId });
    const info = fix?.[0];
    const leagueId = info?.league?.id;
    const season = info?.league?.season || SEASON;
    const homeId = info?.teams?.home?.id;
    const awayId = info?.teams?.away?.id;

    const [events, stats, hStat, aStat] = await Promise.all([
      apiGet("/fixtures/events", { fixture: fixtureId }),
      apiGet("/fixtures/statistics", { fixture: fixtureId }),
      (homeId && leagueId) ? axios.get(`${API}/teams/statistics`, { headers:{ "x-apisports-key": KEY }, params:{ team: homeId, league: leagueId, season } }).then(r=>r.data?.response).catch(()=>null) : null,
      (awayId && leagueId) ? axios.get(`${API}/teams/statistics`, { headers:{ "x-apisports-key": KEY }, params:{ team: awayId, league: leagueId, season } }).then(r=>r.data?.response).catch(()=>null) : null,
    ]);

    const statHome = (stats?.find(s => s.team?.id === homeId)?.statistics || []).map(x => ({ type:x.type, value:x.value }));
    const statAway = (stats?.find(s => s.team?.id === awayId)?.statistics || []).map(x => ({ type:x.type, value:x.value }));

    const pickMinute = o => {
      const m = (o?.goals?.for?.minute) || {};
      const c = (o?.goals?.against?.minute) || {};
      const buckets = ["0-15","16-30","31-45","46-60","61-75","76-90","91-105","106-120"];
      return buckets.map(k => ({
        bucket: k,
        for: m[k]?.percentage || "0%",
        against: c[k]?.percentage || "0%"
      }));
    };
    const homeDist = pickMinute(hStat);
    const awayDist = pickMinute(aStat);

    const ev = (events || []).map(e => ({
      time: e.time?.elapsed ?? 0,
      team: e.team?.name || "",
      type: e.type || "",
      detail: e.detail || "",
      player: e.player?.name || ""
    }));

    const data = {
      id: fixtureId,
      leagueId, season, homeId, awayId,
      scoreboard: {
        home: info?.teams?.home?.name || "Home",
        away: info?.teams?.away?.name || "Away",
        score: `${info?.goals?.home ?? 0} - ${info?.goals?.away ?? 0}`,
        time: (typeof info?.fixture?.status?.elapsed === "number") ? `${info.fixture.status.elapsed}'` : (info?.fixture?.status?.short || "")
      },
      events: ev,
      stats: { home: statHome, away: statAway },
      distribution: { home: homeDist, away: awayDist }
    };

    matchCache.set(fixtureId, { at: Date.now(), data });
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: true, message: e?.response?.data || e.message });
  }
});

// ==== Debug (opsional) ====
router.get("/debug/mapping", (_req, res) => {
  res.json({ whitelistMode: WHITELIST_MODE, totalSelected: ALLOWED_LEAGUE_IDS.size, leagues: WHITELIST_DEBUG });
});
router.get("/debug/order", (_req, res) => {
  res.json(WHITELIST_DEBUG.map(x => ({
    id: x.id, name: x.name, country: x.country,
    weight: leagueWeight({ id: x.id, rawTitle: x.name, country: x.country })
  })).sort((a,b)=> a.weight - b.weight || a.name.localeCompare(b.name)));
});
router.get("/debug/status", async (_req, res) => {
  try {
    const r = await axios.get(`${API}/status`, { headers: { "x-apisports-key": KEY }});
    res.json({ ok:true, status:r.status, data:r.data });
  } catch (e) {
    res.status(e?.response?.status || 500).json({ ok:false, err:e?.response?.data || e.message });
  }
});


export default router;
