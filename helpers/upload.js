import multer from "multer";
import path from "path";
import crypto from "crypto";
import { ensureDir, uploadDir } from "./json-db.js";

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try { await ensureDir(); cb(null, uploadDir); } catch (err) { cb(err); }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.webp';
    cb(null, `${Date.now()}-${crypto.randomUUID().slice(0,8)}${ext}`);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.MAX_UPLOAD_SIZE || 5 * 1024 * 1024) },
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype || '')) return cb(new Error('File harus gambar'));
    cb(null, true);
  }
});

export function uploadedUrl(file){ return file ? `/uploads/${file.filename}` : ''; }
