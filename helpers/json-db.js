import fs from "fs/promises";
import path from "path";

export const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const uploadDir = path.join(dataDir, "uploads");

export async function ensureDir(){
  await fs.mkdir(dataDir,{recursive:true});
  await fs.mkdir(uploadDir,{recursive:true});
}

export async function readJson(filename, fallback){
  await ensureDir();
  const file = path.join(dataDir, filename);
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw || 'null');
    return parsed ?? fallback;
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeJson(filename, fallback);
      return fallback;
    }
    console.error(`[JSON-DB] ${filename} rusak, pakai fallback aman:`, error.message);
    return fallback;
  }
}

export async function writeJson(filename, value){
  await ensureDir();
  const file = path.join(dataDir, filename);
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, file);
  return value;
}
