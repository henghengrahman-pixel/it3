import crypto from "crypto";
import {
  getNews,
  getQuickActions,
  getSettings,
  getSlides,
  saveNews,
  saveQuickActions,
  saveSettings,
  saveSlides
} from "../helpers/store.js";

import { uploadedUrl } from "../helpers/upload.js";

const id = (prefix) => `${prefix}-${crypto.randomUUID().slice(0,8)}`;

const toBool = (value) =>
  value === 'true' ||
  value === 'on' ||
  value === true;

const clean = (value='') =>
  String(value || '').trim();

const arrTags = value =>
  clean(value)
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);

const nowIso = () =>
  new Date().toISOString();

const slugify = (text='') =>
  clean(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,90) || `berita-${Date.now()}`;

const excerptFrom = (content='') =>
  clean(
    String(content)
      .replace(/<[^>]*>/g,' ')
      .replace(/\s+/g,' ')
  ).slice(0,180);

const pickImage = (bodyValue, file) =>
  uploadedUrl(file) || clean(bodyValue);

/* =========================================
FORMAT ARTIKEL PREMIUM
========================================= */

function formatArticle(content=''){

  return String(content || '')
    .replace(/\r\n/g, '\n')

    .split('\n')

    .map(line => {

      const text = line.trim();

      if(!text){
        return '';
      }

      // jika sudah html biarkan
      if(
        text.startsWith('<h1') ||
        text.startsWith('<h2') ||
        text.startsWith('<h3') ||
        text.startsWith('<ul') ||
        text.startsWith('<ol') ||
        text.startsWith('<li') ||
        text.startsWith('<img') ||
        text.startsWith('<blockquote') ||
        text.startsWith('<p')
      ){
        return text;
      }

      // auto heading
      if(text.startsWith('### ')){
        return `<h3>${text.replace('### ','')}</h3>`;
      }

      if(text.startsWith('## ')){
        return `<h2>${text.replace('## ','')}</h2>`;
      }

      if(text.startsWith('# ')){
        return `<h1>${text.replace('# ','')}</h1>`;
      }

      // auto list
      if(text.startsWith('- ')){
        return `<li>${text.replace('- ','')}</li>`;
      }

      // paragraph biasa
      return `<p>${text}</p>`;
    })

    .join('\n')

    .replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/g, '');
}

function adminMenu(pageTitle){
  return pageTitle;
}

/* =========================================
LOGIN
========================================= */

export async function loginPage(req,res){

  if(req.session?.isAdmin){
    return res.redirect('/admin/dashboard');
  }

  res.render('admin/login',{
    layout:'layouts/admin',
    pageTitle:'Login Admin',
    error:req.query.error || ''
  });
}

export async function loginAction(req,res){

  const { adminId, password } = req.body;

  if(
    adminId === process.env.ADMIN_ID &&
    password === process.env.ADMIN_PASSWORD
  ){

    req.session.isAdmin = true;
    req.session.adminId = adminId;

    return req.session.save(() => {
      res.redirect('/admin/dashboard');
    });
  }

  return res.redirect('/admin/login?error=Kredensial%20admin%20tidak%20valid');
}

export async function logoutAction(req,res){

  req.session.destroy(() => {

    res.clearCookie('bandartoto.sid');

    res.redirect('/admin/login');
  });
}

/* =========================================
DASHBOARD
========================================= */

export async function dashboardPage(req,res){

  const [
    slides,
    quickActions,
    settings,
    news
  ] = await Promise.all([
    getSlides(),
    getQuickActions(),
    getSettings(),
    getNews()
  ]);

  res.render('admin/dashboard',{
    layout:'layouts/admin',
    pageTitle:'Dashboard Admin',
    slides,
    quickActions,
    settings,
    news
  });
}

/* =========================================
SLIDES
========================================= */

export async function slidesPage(req,res){

  const slides = await getSlides();

  res.render('admin/slides',{
    layout:'layouts/admin',
    pageTitle:'Kelola Slides',
    slides
  });
}

export async function slidesCreate(req,res){

  const slides = await getSlides();

  slides.push({
    id:id('slide'),
    title:clean(req.body.title) || 'Slide',
    image:pickImage(req.body.image, req.file),
    link:clean(req.body.link) || '#',
    order:Number(req.body.order || slides.length + 1),
    active:toBool(req.body.active)
  });

  await saveSlides(slides);

  res.redirect('/admin/slides');
}

export async function slidesUpdate(req,res){

  const slides = await getSlides();

  await saveSlides(
    slides.map(item =>

      item.id === req.params.id
        ? {
            ...item,

            title:
              clean(req.body.title) || item.title,

            image:
              pickImage(req.body.image, req.file) || item.image,

            link:
              clean(req.body.link) || item.link,

            order:
              Number(req.body.order || item.order || 0),

            active:
              toBool(req.body.active)
          }

        : item
    )
  );

  res.redirect('/admin/slides');
}

export async function slidesDelete(req,res){

  const slides = await getSlides();

  await saveSlides(
    slides.filter(item => item.id !== req.params.id)
  );

  res.redirect('/admin/slides');
}

/* =========================================
QUICK ACTIONS
========================================= */

export async function quickActionsPage(req,res){

  const quickActions = await getQuickActions();

  res.render('admin/quick-actions',{
    layout:'layouts/admin',
    pageTitle:'Kelola Quick Actions',
    quickActions
  });
}

export async function quickActionsCreate(req,res){

  const rows = await getQuickActions();

  rows.push({
    id:id('qa'),

    title:
      clean(req.body.title) || 'Quick Action',

    icon:
      pickImage(req.body.icon, req.file),

    link:
      clean(req.body.link) || '#',

    color:
      clean(req.body.color) || '',

    order:
      Number(req.body.order || rows.length + 1),

    active:
      toBool(req.body.active)
  });

  await saveQuickActions(rows);

  res.redirect('/admin/quick-actions');
}

export async function quickActionsUpdate(req,res){

  const rows = await getQuickActions();

  await saveQuickActions(

    rows.map(item =>

      item.id === req.params.id
        ? {
            ...item,

            title:
              clean(req.body.title) || item.title,

            icon:
              pickImage(req.body.icon, req.file) || item.icon,

            link:
              clean(req.body.link) || item.link,

            color:
              clean(req.body.color) || item.color || '',

            order:
              Number(req.body.order || item.order || 0),

            active:
              toBool(req.body.active)
          }

        : item
    )
  );

  res.redirect('/admin/quick-actions');
}

export async function quickActionsDelete(req,res){

  const rows = await getQuickActions();

  await saveQuickActions(
    rows.filter(item => item.id !== req.params.id)
  );

  res.redirect('/admin/quick-actions');
}

/* =========================================
SETTINGS
========================================= */

export async function settingsPage(req,res){

  const settings = await getSettings();

  res.render('admin/settings',{
    layout:'layouts/admin',
    pageTitle:'Site Settings',
    settings
  });
}

export async function settingsUpdate(req,res){

  const old = await getSettings();

  const files = req.files || {};

  await saveSettings({

    ...old,

    /* =====================================
    BRANDING
    ===================================== */

    siteName:
      clean(req.body.siteName),

    siteSubtitle:
      clean(req.body.siteSubtitle),

    loginUrl:
      clean(req.body.loginUrl),

    registerUrl:
      clean(req.body.registerUrl),

    liveUrl:
      clean(req.body.liveUrl) || '/live',

    newsUrl:
      clean(req.body.newsUrl) || '/berita',

    runningText:
      clean(req.body.runningText),

    footerText:
      clean(req.body.footerText),

    /* =====================================
    SEO
    ===================================== */

    metaTitle:
      clean(req.body.metaTitle) || 'Prediksi Bola',

    metaDescription:
      clean(req.body.metaDescription),

    /* =====================================
    LOGO
    ===================================== */

    logoUrl:
      uploadedUrl(files.logoFile?.[0]) ||
      clean(req.body.logoUrl),

    faviconUrl:
      uploadedUrl(files.faviconFile?.[0]) ||
      clean(req.body.faviconUrl),

    /* =====================================
    BACKGROUND
    ===================================== */

    backgroundDesktop:
      uploadedUrl(files.backgroundDesktopFile?.[0]) ||
      clean(req.body.backgroundDesktop),

    backgroundMobile:
      uploadedUrl(files.backgroundMobileFile?.[0]) ||
      clean(req.body.backgroundMobile),

    overlayOpacity:
      clean(req.body.overlayOpacity) || '0',

    /* =====================================
    SIDEBAR ADS
    ===================================== */

    sidebarBanner:
      uploadedUrl(files.sidebarBannerFile?.[0]) ||
      clean(req.body.sidebarBanner),

    sidebarBannerLink:
      clean(req.body.sidebarBannerLink),

    /* =====================================
    BERITA SETTINGS
    ===================================== */

    newsSearchTitle:
      clean(req.body.newsSearchTitle) || 'Cari Berita',

    newsSearchPlaceholder:
      clean(req.body.newsSearchPlaceholder) ||
      'Cari klub, liga, pemain...',

    newsTrendingTitle:
      clean(req.body.newsTrendingTitle) ||
      'Trending News',

    newsCategoryTitle:
      clean(req.body.newsCategoryTitle) ||
      'Kategori Populer'
  });

  res.redirect('/admin/settings');
}

/* =========================================
NEWS
========================================= */

export async function newsPage(req,res){

  const news = await getNews();

  res.render('admin/news',{
    layout:'layouts/admin',
    pageTitle:'Semua Berita',
    news
  });
}

export async function newsNewPage(req,res){

  res.render('admin/news-form',{
    layout:'layouts/admin',
    pageTitle:'Tambah Berita',
    news:null
  });
}

export async function newsEditPage(req,res){

  const news = (await getNews())
    .find(item => item.id === req.params.id);

  if(!news){
    return res.redirect('/admin/news');
  }

  res.render('admin/news-form',{
    layout:'layouts/admin',
    pageTitle:'Edit Berita',
    news
  });
}

export async function newsCreate(req,res){

  const rows = await getNews();

  const createdAt = nowIso();

  const title =
    clean(req.body.title) || 'Berita Bola';

  let slug =
    slugify(req.body.slug || title);

  if(rows.some(n => n.slug === slug)){

    slug =
      `${slug}-${Date.now().toString().slice(-5)}`;
  }

  const content =
    formatArticle(req.body.content);

  rows.unshift({

    id:id('news'),

    title,
    slug,

    excerpt:
      clean(req.body.excerpt) ||
      excerptFrom(content),

    content,

    thumbnail:
      pickImage(req.body.thumbnail, req.file),

    category:
      clean(req.body.category) || 'Berita Bola',

    tags:
      arrTags(req.body.tags),

    author:
      clean(req.body.author) || 'Redaksi Bola',

    status:
      clean(req.body.status) || 'published',

    createdAt,

    updatedAt:
      createdAt,

    publishedAt:
      clean(req.body.publishedAt) || createdAt
  });

  await saveNews(rows);

  res.redirect('/admin/news');
}

export async function newsUpdate(req,res){

  const rows = await getNews();

  await saveNews(

    rows.map(item => {

      if(item.id !== req.params.id){
        return item;
      }

      const title =
        clean(req.body.title) || item.title;

      const content =
        formatArticle(req.body.content);

      return {

        ...item,

        title,

        slug:
          slugify(
            req.body.slug ||
            item.slug ||
            title
          ),

        excerpt:
          clean(req.body.excerpt) ||
          excerptFrom(content),

        content,

        thumbnail:
          pickImage(req.body.thumbnail, req.file) ||
          item.thumbnail,

        category:
          clean(req.body.category) || 'Berita Bola',

        tags:
          arrTags(req.body.tags),

        author:
          clean(req.body.author) || 'Redaksi Bola',

        status:
          clean(req.body.status) || 'published',

        updatedAt:
          nowIso(),

        publishedAt:
          clean(req.body.publishedAt) ||
          item.publishedAt ||
          item.createdAt
      };
    })
  );

  res.redirect('/admin/news');
}

export async function newsDelete(req,res){

  const rows = await getNews();

  await saveNews(
    rows.filter(item => item.id !== req.params.id)
  );

  res.redirect('/admin/news');
}
