import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getMenuUploadDir() {
  const configured = process.env.IMAGE_UPLOAD_DIR;
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(__dirname, "../..", configured);
  }
  return path.join(__dirname, "../../public/menu");
}

export function ensureMenuUploadDir() {
  const dir = getMenuUploadDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Public URL path stored in DB */
export function publicImagePath(filename) {
  return `/public/menu/${filename}`;
}
