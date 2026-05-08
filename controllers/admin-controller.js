import crypto from "crypto";
import {
  getAds,
  getPosts,
  getQuickActions,
  getSettings,
  getSlides,
  saveAds,
  savePosts,
  saveQuickActions,
  saveSettings,
  saveSlides
} from "../helpers/store.js";
import { makeExcerpt, slugify } from "../helpers/slug.js";
import { generateDailyParlay, getAutoParlayStatus } from "../helpers/auto-parlay.js";

const id = (prefix) => `${prefix}-${crypto.randomUUID().slice(0,8)}`;
const toBool = (value) => value === 'true' || value === 'on' || value === true;
const splitTags = (value = "") => String(value).split(',').map(s => s.trim()).filter(Boolean);

function parsePredictions(raw = ""){
  const text = String(raw || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(league => ({
      league: String(league.league || "Liga").trim(),
      matches: Array.isArray(league.matches) ? league.matches.map(match => ({
        match: String(match.match || "").trim(),
        pick: String(match.pick || "").trim(),
        ou: String(match.ou || "").trim().toUpperCase(),
        score: String(match.score || "").trim()
      })).filter(m => m.match) : []
    })).filter(l => l.league && l.matches.length);
  } catch {
    return [];
  }
}

function predictionsToText(predictions = []){
  return JSON.stringify(predictions || [], null, 2);
}

function thumbnailFromRequest(req, fallback = ""){
  if (req.file?.filename) return `/uploads/${req.file.filename}`;
  return req.body.thumbnailUrl?.trim() || fallback || "";
}

async function uniqueSlug(base, currentId = null){
  const posts = await getPosts({ includeDrafts: true });
  let slug = slugify(base);
  let finalSlug = slug;
  let i = 2;
  while (posts.some(p => p.slug === finalSlug && p.id !== currentId)) {
    finalSlug = `${slug}-${i++}`;
  }
  return finalSlug;
}

export async function loginPage(req,res){
  if(req.session?.isAdmin) return res.redirect('/admin/dashboard');
  res.render('admin/login',{layout:'layouts/admin',pageTitle:'Login Admin',error:req.query.error||''});
}
export async function loginAction(req,res){
  const { adminId, password } = req.body;
  if(adminId === process.env.ADMIN_ID && password === process.env.ADMIN_PASSWORD){
    req.session.isAdmin=true;
    req.session.adminId=adminId;
    return req.session.save(()=>res.redirect('/admin/dashboard'));
  }
  return res.redirect('/admin/login?error=Kredensial%20admin%20tidak%20valid');
}
export async function logoutAction(req,res){ req.session.destroy(()=>{ res.clearCookie('bandartoto.sid'); res.redirect('/admin/login'); }); }
export async function dashboardPage(req,res){
  const [slides, quickActions, settings, posts, ads, autoParlayStatus] = await Promise.all([getSlides(), getQuickActions(), getSettings(), getPosts({ includeDrafts:true }), getAds(), getAutoParlayStatus()]);
  res.render('admin/dashboard',{layout:'layouts/admin',pageTitle:'Dashboard Admin',slides,quickActions,settings,posts,ads,autoParlayStatus});
}

export async function autoParlayRun(req,res){
  const result = await generateDailyParlay({ force: req.body.force === 'true' });
  const msg = encodeURIComponent(result.ok ? (result.skipped ? 'Auto parlay sudah ada hari ini' : 'Auto parlay berhasil dibuat') : `Auto parlay gagal: ${result.error || result.message}`);
  res.redirect(`/admin/dashboard?auto=${msg}`);
}

export async function slidesPage(req,res){ const slides = await getSlides(); res.render('admin/slides',{layout:'layouts/admin',pageTitle:'Kelola Slides',slides}); }
export async function slidesCreate(req,res){ const slides = await getSlides(); slides.push({ id:id('slide'), title:req.body.title?.trim()||'Slide', image:req.body.image?.trim()||'', link:req.body.link?.trim()||'#', order:Number(req.body.order||slides.length+1), active:toBool(req.body.active) }); await saveSlides(slides); res.redirect('/admin/slides'); }
export async function slidesUpdate(req,res){ const slides = await getSlides(); await saveSlides(slides.map(item => item.id === req.params.id ? { ...item, title:req.body.title?.trim()||item.title, image:req.body.image?.trim()||item.image, link:req.body.link?.trim()||item.link, order:Number(req.body.order||item.order||0), active:toBool(req.body.active) } : item)); res.redirect('/admin/slides'); }
export async function slidesDelete(req,res){ const slides = await getSlides(); await saveSlides(slides.filter(item=>item.id !== req.params.id)); res.redirect('/admin/slides'); }

export async function quickActionsPage(req,res){ const quickActions = await getQuickActions(); res.render('admin/quick-actions',{layout:'layouts/admin',pageTitle:'Kelola Quick Actions',quickActions}); }
export async function quickActionsCreate(req,res){ const rows = await getQuickActions(); rows.push({ id:id('qa'), title:req.body.title?.trim()||'Quick Action', icon:req.body.icon?.trim()||'', link:req.body.link?.trim()||'#', order:Number(req.body.order||rows.length+1), active:toBool(req.body.active) }); await saveQuickActions(rows); res.redirect('/admin/quick-actions'); }
export async function quickActionsUpdate(req,res){ const rows = await getQuickActions(); await saveQuickActions(rows.map(item => item.id === req.params.id ? { ...item, title:req.body.title?.trim()||item.title, icon:req.body.icon?.trim()||item.icon, link:req.body.link?.trim()||item.link, order:Number(req.body.order||item.order||0), active:toBool(req.body.active) } : item)); res.redirect('/admin/quick-actions'); }
export async function quickActionsDelete(req,res){ const rows = await getQuickActions(); await saveQuickActions(rows.filter(item=>item.id !== req.params.id)); res.redirect('/admin/quick-actions'); }

export async function settingsPage(req,res){ const settings = await getSettings(); res.render('admin/settings',{layout:'layouts/admin',pageTitle:'Site Settings',settings}); }
export async function settingsUpdate(req,res){ await saveSettings({ siteName:req.body.siteName?.trim(), loginUrl:req.body.loginUrl?.trim(), registerUrl:req.body.registerUrl?.trim(), runningText:req.body.runningText?.trim(), logoUrl:req.body.logoUrl?.trim(), footerText:req.body.footerText?.trim(), metaTitle:req.body.metaTitle?.trim(), metaDescription:req.body.metaDescription?.trim() }); res.redirect('/admin/settings'); }

export async function postsPage(req,res){
  const posts = await getPosts({ includeDrafts:true });
  res.render('admin/posts',{layout:'layouts/admin',pageTitle:'Kelola Posts',posts});
}
export async function postNewPage(req,res){
  res.render('admin/post-form',{layout:'layouts/admin',pageTitle:'Tambah Post',post:null,predictionsText:predictionsToText(samplePredictions())});
}
export async function postEditPage(req,res){
  const posts = await getPosts({ includeDrafts:true });
  const post = posts.find(p => p.id === req.params.id);
  if(!post) return res.redirect('/admin/posts');
  res.render('admin/post-form',{layout:'layouts/admin',pageTitle:'Edit Post',post,predictionsText:predictionsToText(post.predictions)});
}
export async function postCreate(req,res){
  const posts = await getPosts({ includeDrafts:true });
  const now = new Date().toISOString();
  const title = req.body.title?.trim() || 'Post Baru';
  const content = req.body.content?.trim() || '';
  const slug = await uniqueSlug(req.body.slug?.trim() || title);
  posts.push({
    id:id('post'), title, slug,
    category:req.body.category?.trim() || 'Prediksi Parlay',
    tags:splitTags(req.body.tags),
    author:req.body.author?.trim() || 'Master Parlay',
    thumbnail:thumbnailFromRequest(req),
    excerpt:req.body.excerpt?.trim() || makeExcerpt(content),
    content,
    published:toBool(req.body.published),
    createdAt:req.body.createdAt ? new Date(req.body.createdAt).toISOString() : now,
    updatedAt:now,
    predictions:parsePredictions(req.body.predictions)
  });
  await savePosts(posts);
  res.redirect('/admin/posts');
}
export async function postUpdate(req,res){
  const posts = await getPosts({ includeDrafts:true });
  const current = posts.find(p => p.id === req.params.id);
  if(!current) return res.redirect('/admin/posts');
  const title = req.body.title?.trim() || current.title;
  const content = req.body.content?.trim() || '';
  const slug = await uniqueSlug(req.body.slug?.trim() || title, current.id);
  await savePosts(posts.map(item => item.id === current.id ? {
    ...item,
    title, slug,
    category:req.body.category?.trim() || item.category || 'Prediksi Parlay',
    tags:splitTags(req.body.tags),
    author:req.body.author?.trim() || item.author || 'Master Parlay',
    thumbnail:thumbnailFromRequest(req, item.thumbnail),
    excerpt:req.body.excerpt?.trim() || makeExcerpt(content),
    content,
    published:toBool(req.body.published),
    createdAt:req.body.createdAt ? new Date(req.body.createdAt).toISOString() : item.createdAt,
    updatedAt:new Date().toISOString(),
    predictions:parsePredictions(req.body.predictions)
  } : item));
  res.redirect('/admin/posts');
}
export async function postDelete(req,res){
  const posts = await getPosts({ includeDrafts:true });
  await savePosts(posts.filter(item=>item.id !== req.params.id));
  res.redirect('/admin/posts');
}

export async function adsPage(req,res){ const ads = await getAds(); res.render('admin/ads',{layout:'layouts/admin',pageTitle:'Kelola Ads',ads}); }
export async function adsCreate(req,res){
  const ads = await getAds();
  ads.push({ id:id('ad'), title:req.body.title?.trim()||'Banner', image:thumbnailFromRequest(req), link:req.body.link?.trim()||'#', position:req.body.position?.trim()||'sidebar', order:Number(req.body.order||ads.length+1), active:toBool(req.body.active) });
  await saveAds(ads); res.redirect('/admin/ads');
}
export async function adsUpdate(req,res){
  const ads = await getAds();
  await saveAds(ads.map(item => item.id === req.params.id ? { ...item, title:req.body.title?.trim()||item.title, image:thumbnailFromRequest(req, item.image), link:req.body.link?.trim()||item.link, position:req.body.position?.trim()||item.position, order:Number(req.body.order||item.order||0), active:toBool(req.body.active) } : item));
  res.redirect('/admin/ads');
}
export async function adsDelete(req,res){ const ads = await getAds(); await saveAds(ads.filter(item=>item.id !== req.params.id)); res.redirect('/admin/ads'); }

function samplePredictions(){
  return [
    { league:'BRI Super League', matches:[{ match:'PSIM vs Persija', pick:'2', ou:'OVER', score:'1 - 2' },{ match:'Persis vs Bhayangkara', pick:'X', ou:'UNDER', score:'1 - 1' }] },
    { league:'Italian Serie A', matches:[{ match:'Inter Milan vs Lazio', pick:'1', ou:'OVER', score:'2 - 1' }] }
  ];
}
