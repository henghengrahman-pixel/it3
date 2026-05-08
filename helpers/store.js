import { readJson, writeJson } from "./json-db.js";
import { defaultAds, defaultPosts, defaultQuickActions, defaultSettings, defaultSlides } from "./default-data.js";

const byOrder = (a,b) => Number(a.order || 0) - Number(b.order || 0);
const byDateDesc = (a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
const PREDICTION_MAX_AGE_DAYS = Number(process.env.PREDICTION_MAX_AGE_DAYS || 60);

export async function getSlides(){ const rows = await readJson('slides.json', defaultSlides); return [...rows].sort(byOrder); }
export async function saveSlides(rows){ return writeJson('slides.json', [...rows].sort(byOrder)); }

export async function getQuickActions(){ const rows = await readJson('quick-actions.json', defaultQuickActions); return [...rows].sort(byOrder); }
export async function saveQuickActions(rows){ return writeJson('quick-actions.json', [...rows].sort(byOrder)); }

export async function getSettings(){ return readJson('settings.json', defaultSettings); }
export async function saveSettings(rows){ return writeJson('settings.json', { ...defaultSettings, ...rows }); }

export async function getAds(){ const rows = await readJson('ads.json', defaultAds); return [...rows].sort(byOrder); }
export async function saveAds(rows){ return writeJson('ads.json', [...rows].sort(byOrder)); }

function isExpiredPost(post){
  if (post?.autoDelete === false) return false;
  if (!post?.createdAt) return false;
  const created = new Date(post.createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  const maxAge = PREDICTION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - created > maxAge;
}

export async function cleanupOldPredictions(){
  const rows = await readJson('posts.json', defaultPosts);
  const filtered = rows.filter(post => !isExpiredPost(post));
  if (filtered.length !== rows.length) await writeJson('posts.json', filtered);
  return filtered;
}

export async function getPosts({ includeDrafts = false } = {}){
  const rows = await cleanupOldPredictions();
  return [...rows].filter(p => includeDrafts || p.published).sort(byDateDesc);
}
export async function savePosts(rows){
  const cleaned = [...rows].filter(post => !isExpiredPost(post)).sort(byDateDesc);
  return writeJson('posts.json', cleaned);
}
export async function findPostBySlug(slug, { includeDrafts = false } = {}){
  const posts = await getPosts({ includeDrafts });
  return posts.find(p => p.slug === slug);
}
