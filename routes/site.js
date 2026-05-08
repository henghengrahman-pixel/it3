import express from "express";
import { findPostBySlug, getAds, getPosts } from "../helpers/store.js";

const router = express.Router();
const postStyles = ['/assets/css/styles.css', '/assets/css/blog.css'];

function fmtDate(date){
  return new Date(date || Date.now()).toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
}
function siteUrl(req){
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}

router.get('/', async (req,res)=>{
  const page = Math.max(1, Number(req.query.page || 1));
  const perPage = 6;
  const posts = await getPosts();
  const totalPages = Math.max(1, Math.ceil(posts.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * perPage;
  res.render('pages/home',{
    pageTitle:res.locals.settings.metaTitle||'Prediksi Bola',
    pageDescription:res.locals.settings.metaDescription||'',
    activePage:'home',
    styles:['/assets/css/styles.css','/assets/css/blog.css'],
    scripts:['/assets/js/home.js'],
    posts: posts.slice(start, start + perPage),
    allPosts: posts,
    currentPage,
    totalPages,
    fmtDate
  });
});

router.get('/live', (req,res)=>res.render('pages/live',{pageTitle:`Live Score • ${res.locals.settings.siteName||'Bandar Toto'}`,pageDescription:res.locals.settings.metaDescription||'',activePage:'live',styles:['/assets/css/styles.css','/assets/css/live.css'],scripts:['/assets/js/live.js']}));

router.get('/search', async (req,res)=>{
  const q = String(req.query.q || '').trim().toLowerCase();
  const all = await getPosts();
  const posts = q ? all.filter(p => [p.title,p.excerpt,p.category,(p.tags||[]).join(' ')].join(' ').toLowerCase().includes(q)) : [];
  res.render('pages/search', { pageTitle:`Search ${q}`, pageDescription:`Hasil pencarian ${q}`, activePage:'search', styles:postStyles, scripts:[], posts, q, fmtDate });
});

router.get('/category/:category', async (req,res)=>{
  const categorySlug = req.params.category;
  const all = await getPosts();
  const posts = all.filter(p => String(p.category || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') === categorySlug);
  res.render('pages/search', { pageTitle:`Kategori ${categorySlug}`, pageDescription:`Post kategori ${categorySlug}`, activePage:'category', styles:postStyles, scripts:[], posts, q:`Kategori: ${categorySlug}`, fmtDate });
});

router.get('/sitemap.xml', async (req,res)=>{
  const base = siteUrl(req).replace(/\/+$/, '');
  const posts = await getPosts();
  const urls = ['/', '/live', ...posts.map(p => `/${p.slug}`)];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `\n  <url><loc>${base}${u}</loc></url>`).join('')}\n</urlset>`);
});

router.get('/robots.txt', (req,res)=>{
  const base = siteUrl(req).replace(/\/+$/, '');
  res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
});

router.get('/:slug', async (req,res,next)=>{
  const post = await findPostBySlug(req.params.slug);
  if(!post) return next();
  const posts = await getPosts();
  const related = posts.filter(p => p.id !== post.id && p.category === post.category).slice(0, 4);
  const ads = await getAds();
  res.render('pages/post', {
    pageTitle: `${post.title} • ${res.locals.settings.siteName || 'Prediksi Bola'}`,
    pageDescription: post.excerpt || res.locals.settings.metaDescription || '',
    activePage:'post',
    styles:postStyles,
    scripts:[],
    post,
    related,
    ads: ads.filter(a => a.active),
    canonical:`${siteUrl(req).replace(/\/+$/, '')}/${post.slug}`,
    fmtDate
  });
});

export default router;
