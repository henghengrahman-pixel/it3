import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import session from 'express-session';
import methodOverride from 'method-override';
import expressLayouts from 'express-ejs-layouts';

import siteRoutes from './routes/site.js';
import adminRoutes from './routes/admin.js';
import apiRoutes from './routes/api.js';

import { getViewData } from './helpers/view-data.js';
import { uploadDir } from './helpers/json-db.js';

import {
  startAutoParlayScheduler,
  generateDailyParlay
} from './helpers/auto-parlay.js';

const app = express();

const PORT = process.env.PORT || 8080;
const isProduction =
  process.env.NODE_ENV === 'production';

// ================= TRUST PROXY =================
app.set('trust proxy', 1);

// ================= VIEW ENGINE =================
app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));
app.set('layout', 'layouts/main');

// ================= MIDDLEWARE =================
app.use(expressLayouts);

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.urlencoded({
  extended: true
}));

app.use(express.json());

app.use(methodOverride('_method'));

app.use(express.static(
  path.join(process.cwd(), 'public')
));

app.use(
  '/uploads',
  express.static(uploadDir)
);

// ================= SESSION =================
app.use(session({
  name: 'bandartoto.sid',

  secret:
    process.env.SESSION_SECRET ||
    'change-me-please',

  resave: false,

  saveUninitialized: false,

  proxy: true,

  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge:
      1000 * 60 * 60 * 8
  }
}));

// ================= GLOBAL VIEW DATA =================
app.use(async (req, res, next) => {

  try {

    const viewData =
      await getViewData();

    res.locals.settings =
      viewData?.settings || {};

    res.locals.slides =
      viewData?.slides || [];

    res.locals.quickActions =
      viewData?.quickActions || [];

    res.locals.ads =
      viewData?.ads || [];

    res.locals.latestPosts =
      viewData?.latestPosts || [];

    res.locals.baseUrl =
      process.env.BASE_URL ||
      `http://localhost:${PORT}`;

    res.locals.path =
      req.path;

    res.locals.query =
      req.query || {};

    res.locals.isAdmin =
      Boolean(req.session?.isAdmin);

    next();

  } catch (err) {

    console.error(
      'VIEW DATA ERROR:',
      err
    );

    res.locals.settings = {};
    res.locals.slides = [];
    res.locals.quickActions = [];
    res.locals.ads = [];
    res.locals.latestPosts = [];

    res.locals.baseUrl =
      process.env.BASE_URL ||
      `http://localhost:${PORT}`;

    res.locals.path =
      req.path;

    res.locals.query =
      req.query || {};

    res.locals.isAdmin = false;

    next();

  }

});

// ================= ROUTES =================
app.use('/admin', adminRoutes);

app.use(apiRoutes);

app.use(siteRoutes);

// ================= TEST ROUTE =================
app.get('/test', async (req, res) => {

  try {

    const result =
      await generateDailyParlay({
        force: true
      });

    res.json(result);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      ok: false,
      error: err.message
    });

  }

});

// ================= AUTO GENERATE ROUTE =================
app.get('/generate-parlay', async (req, res) => {

  try {

    const result =
      await generateDailyParlay({
        force: true
      });

    res.json(result);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      ok:false,
      error: err.message
    });

  }

});

// ================= 404 =================
app.use((req, res) => {

  res.status(404).render(
    'pages/404',
    {
      pageTitle:
        '404 • Halaman Tidak Ditemukan',

      pageDescription:
        'Halaman tidak ditemukan.',

      activePage: '404',

      styles: [
        '/assets/css/styles.css'
      ],

      scripts: []
    }
  );

});

// ================= ERROR HANDLER =================
process.on(
  'uncaughtException',
  (err) => {

    console.error(
      'UNCAUGHT EXCEPTION:',
      err
    );

  }
);

process.on(
  'unhandledRejection',
  (err) => {

    console.error(
      'UNHANDLED REJECTION:',
      err
    );

  }
);

// ================= START SERVER =================
app.listen(
  PORT,
  '0.0.0.0',
  async () => {

    console.log(
      `Server running on port ${PORT}`
    );

    console.log(
      `Environment: ${process.env.NODE_ENV}`
    );

    console.log(
      `Base URL: ${process.env.BASE_URL}`
    );

    // START AUTO PARLAY
    startAutoParlayScheduler();

    // AUTO GENERATE SAAT START
    if (
      process.env
      .AUTO_PARLAY_RUN_ON_START === 'true'
    ) {

      try {

        console.log(
          '[AUTO PARLAY] GENERATE START'
        );

        await generateDailyParlay();

      } catch (err) {

        console.error(
          '[AUTO PARLAY ERROR]',
          err
        );

      }

    }

  }
);
