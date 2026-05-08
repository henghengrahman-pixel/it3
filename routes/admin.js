import express from "express";
import * as admin from "../controllers/admin-controller.js";
import { requireAdmin } from "../middleware/admin-auth.js";
import { uploadImage } from "../middleware/upload.js";

const router = express.Router();

router.get('/login', admin.loginPage);
router.post('/login', admin.loginAction);
router.post('/logout', requireAdmin, admin.logoutAction);
router.get('/dashboard', requireAdmin, admin.dashboardPage);
router.post('/auto-parlay/run', requireAdmin, admin.autoParlayRun);

router.get('/posts', requireAdmin, admin.postsPage);
router.get('/posts/new', requireAdmin, admin.postNewPage);
router.post('/posts', requireAdmin, uploadImage.single('thumbnailFile'), admin.postCreate);
router.get('/posts/:id/edit', requireAdmin, admin.postEditPage);
router.post('/posts/:id/update', requireAdmin, uploadImage.single('thumbnailFile'), admin.postUpdate);
router.post('/posts/:id/delete', requireAdmin, admin.postDelete);

router.get('/ads', requireAdmin, admin.adsPage);
router.post('/ads', requireAdmin, uploadImage.single('imageFile'), admin.adsCreate);
router.post('/ads/:id/update', requireAdmin, uploadImage.single('imageFile'), admin.adsUpdate);
router.post('/ads/:id/delete', requireAdmin, admin.adsDelete);

router.get('/slides', requireAdmin, admin.slidesPage);
router.post('/slides', requireAdmin, admin.slidesCreate);
router.post('/slides/:id/update', requireAdmin, admin.slidesUpdate);
router.post('/slides/:id/delete', requireAdmin, admin.slidesDelete);
router.get('/quick-actions', requireAdmin, admin.quickActionsPage);
router.post('/quick-actions', requireAdmin, admin.quickActionsCreate);
router.post('/quick-actions/:id/update', requireAdmin, admin.quickActionsUpdate);
router.post('/quick-actions/:id/delete', requireAdmin, admin.quickActionsDelete);
router.get('/settings', requireAdmin, admin.settingsPage);
router.post('/settings', requireAdmin, admin.settingsUpdate);

export default router;
