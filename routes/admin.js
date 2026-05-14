import express from "express";
import * as admin from "../controllers/admin-controller.js";
import { requireAdmin } from "../middleware/admin-auth.js";
import { upload } from "../helpers/upload.js";

const router = express.Router();
router.get('/login', admin.loginPage);
router.post('/login', admin.loginAction);
router.post('/logout', requireAdmin, admin.logoutAction);
router.get('/', requireAdmin, (req,res)=>res.redirect('/admin/dashboard'));
router.get('/dashboard', requireAdmin, admin.dashboardPage);

router.get('/slides', requireAdmin, admin.slidesPage);
router.post('/slides', requireAdmin, upload.single('imageFile'), admin.slidesCreate);
router.post('/slides/:id/update', requireAdmin, upload.single('imageFile'), admin.slidesUpdate);
router.post('/slides/:id/delete', requireAdmin, admin.slidesDelete);

router.get('/quick-actions', requireAdmin, admin.quickActionsPage);
router.post('/quick-actions', requireAdmin, upload.single('iconFile'), admin.quickActionsCreate);
router.post('/quick-actions/:id/update', requireAdmin, upload.single('iconFile'), admin.quickActionsUpdate);
router.post('/quick-actions/:id/delete', requireAdmin, admin.quickActionsDelete);

router.get('/settings', requireAdmin, admin.settingsPage);
router.post('/settings', requireAdmin, upload.fields([
  { name:'logoFile', maxCount:1 }, { name:'faviconFile', maxCount:1 },
  { name:'backgroundDesktopFile', maxCount:1 }, { name:'backgroundMobileFile', maxCount:1 },
  { name:'sidebarBannerFile', maxCount:1 }
]), admin.settingsUpdate);

router.get('/news', requireAdmin, admin.newsPage);
router.get('/news/new', requireAdmin, admin.newsNewPage);
router.post('/news', requireAdmin, upload.single('thumbnailFile'), admin.newsCreate);
router.get('/news/:id/edit', requireAdmin, admin.newsEditPage);
router.post('/news/:id/update', requireAdmin, upload.single('thumbnailFile'), admin.newsUpdate);
router.post('/news/:id/delete', requireAdmin, admin.newsDelete);

export default router;
