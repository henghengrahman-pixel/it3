import fs from "fs/promises";
import path from "path";

export const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");

export const uploadDir = path.join(dataDir, "uploads");

export async function ensureDir(){
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadDir, { recursive: true });
}

export async function readJson(filename, fallback){
  await ensureDir();
  const file = path.join(dataDir, filename);
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      await writeJson(filename, fallback);
      return structuredCloneSafe(fallback);
    }
    console.error(`JSON READ ERROR ${filename}:`, error.message);
    await writeJson(filename, fallback);
    return structuredCloneSafe(fallback);
  }
}

export async function writeJson(filename, value){
  await ensureDir();
  const file = path.join(dataDir, filename);
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(temp, file);
  return value;
}

function structuredCloneSafe(value){
  return JSON.parse(JSON.stringify(value));
}
