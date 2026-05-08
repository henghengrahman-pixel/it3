import { readJson, writeJson } from "./json-db.js";
import { defaultAds, defaultPosts, defaultQuickActions, defaultSettings, defaultSlides } from "./default-data.js";

const byOrder = (a,b) => Number(a.order || 0) - Number(b.order || 0);
const byDateDesc = (a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);

export async function getSlides(){ const rows = await readJson('slides.json', defaultSlides); return [...rows].sort(byOrder); }
export async function saveSlides(rows){ return writeJson('slides.json', [...rows].sort(byOrder)); }

export async function getQuickActions(){ const rows = await readJson('quick-actions.json', defaultQuickActions); return [...rows].sort(byOrder); }
export async function saveQuickActions(rows){ return writeJson('quick-actions.json', [...rows].sort(byOrder)); }

export async function getSettings(){ return readJson('settings.json', defaultSettings); }
export async function saveSettings(rows){ return writeJson('settings.json', { ...defaultSettings, ...rows }); }

export async function getAds(){ const rows = await readJson('ads.json', defaultAds); return [...rows].sort(byOrder); }
export async function saveAds(rows){ return writeJson('ads.json', [...rows].sort(byOrder)); }

export async function getPosts({ includeDrafts = false } = {}){
  const rows = await readJson('posts.json', defaultPosts);
  return [...rows].filter(p => includeDrafts || p.published).sort(byDateDesc);
}
export async function savePosts(rows){ return writeJson('posts.json', [...rows].sort(byDateDesc)); }
export async function findPostBySlug(slug, { includeDrafts = false } = {}){
  const posts = await getPosts({ includeDrafts });
  return posts.find(p => p.slug === slug);
}
