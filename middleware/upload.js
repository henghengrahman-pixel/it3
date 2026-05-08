import multer from "multer";
import path from "path";
import crypto from "crypto";
import { uploadDir } from "../helpers/json-db.js";

const allowed = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

const storage = multer.diskStorage({
  destination: async (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = allowed.has(ext) ? ext : ".jpg";
    cb(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${safeExt}`);
  }
});

export const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!allowed.has(ext)) return cb(new Error("File harus JPG, PNG, WEBP, atau GIF"));
    cb(null, true);
  }
});
