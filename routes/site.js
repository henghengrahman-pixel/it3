import express from "express";
import { getNews } from "../helpers/store.js";
const router = express.Router();

const fmtDate = (date) => {
  if(!date) return '';
  return new Date(date).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
};
const published = (rows) => (rows || []).filter(n => n.status !== 'draft');
const categories = (rows) => [...new Set(rows.map(n=>n.category).filter(Boolean))];

router.get('/', (req,res)=>res.render('pages/home',{pageTitle:res.locals.settings.metaTitle||'Prediksi Bola',pageDescription:res.locals.settings.metaDescription||'',activePage:'home',styles:['/assets/css/styles.css'],scripts:['/assets/js/home.js']}));

router.get(['/kalkulator-odds','/kalulator-odds'], (req,res)=>res.render('pages/kalkulator-odds',{pageTitle:`Kalkulator Odds • ${res.locals.settings.siteName||'Prediksi Bola'}`,pageDescription:'Kalkulator odds parlay untuk menghitung total odds, potensi hasil, dan estimasi selisih secara cepat.',activePage:'calculator',styles:['/assets/css/styles.css'],scripts:['/assets/js/kalkulator-odds.js']}));

router.get('/live', (req,res)=>res.render('pages/live',{pageTitle:`Live Score • ${res.locals.settings.siteName||'Prediksi Bola'}`,pageDescription:res.locals.settings.metaDescription||'',activePage:'live',styles:['/assets/css/styles.css','/assets/css/live.css'],scripts:['/assets/js/live.js']}));

router.get('/berita', async (req,res)=>{
  const all = published(await getNews());
  const q = String(req.query.q || '').trim().toLowerCase();
  const cat = String(req.query.category || '').trim();
  let news = all;
  if(q) news = news.filter(n => [n.title,n.excerpt,n.content,n.category,(n.tags||[]).join(' ')].join(' ').toLowerCase().includes(q));
  if(cat) news = news.filter(n => n.category === cat);
  res.render('pages/news',{pageTitle:`Berita Bola Terbaru • ${res.locals.settings.siteName||'Prediksi Bola'}`,pageDescription:'Update sepak bola terbaru, transfer pemain, big match, jadwal liga besar, hasil pertandingan, dan artikel pilihan.',activePage:'news',styles:['/assets/css/styles.css'],scripts:['/assets/js/news.js'],news,allNews:all,trending:all.slice(0,5),categories:categories(all),fmtDate,q,cat});
});

router.get('/berita/:slug', async (req,res,next)=>{
  const all = published(await getNews());
  const article = all.find(n => n.slug === req.params.slug);
  if(!article) return next();
  const related = all.filter(n => n.id !== article.id && n.category === article.category).slice(0,3);
  res.render('pages/news-detail',{pageTitle:`${article.title} • ${res.locals.settings.siteName||'Berita Bola'}`,pageDescription:article.excerpt||'',activePage:'news',styles:['/assets/css/styles.css'],scripts:['/assets/js/news.js'],article,related,trending:all.filter(n=>n.id!==article.id).slice(0,5),categories:categories(all),fmtDate});
});

export default router;
