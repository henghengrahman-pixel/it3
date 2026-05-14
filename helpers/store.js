import { readJson, writeJson } from "./json-db.js";
import { defaultQuickActions, defaultSettings, defaultSlides, defaultNews } from "./default-data.js";

const byOrder = (a,b)=>Number(a.order||0)-Number(b.order||0);
const mergeSettings = (settings={}) => ({ ...defaultSettings, ...(settings || {}) });

export async function getSlides(){
  const rows = await readJson('slides.json', defaultSlides);
  return Array.isArray(rows) ? [...rows].sort(byOrder) : [];
}
export async function saveSlides(rows){ return writeJson('slides.json', Array.isArray(rows) ? [...rows].sort(byOrder) : []); }

export async function getQuickActions(){
  const rows = await readJson('quick-actions.json', defaultQuickActions);
  return Array.isArray(rows) ? [...rows].sort(byOrder) : [];
}
export async function saveQuickActions(rows){ return writeJson('quick-actions.json', Array.isArray(rows) ? [...rows].sort(byOrder) : []); }

export async function getSettings(){ return mergeSettings(await readJson('settings.json', defaultSettings)); }
export async function saveSettings(rows){ return writeJson('settings.json', mergeSettings(rows)); }

export async function getNews(){
  const rows = await readJson('news.json', defaultNews);
  return Array.isArray(rows) ? [...rows].sort((a,b)=>String(b.publishedAt||b.createdAt||'').localeCompare(String(a.publishedAt||a.createdAt||''))) : [];
}
export async function saveNews(rows){ return writeJson('news.json', Array.isArray(rows) ? rows : []); }
