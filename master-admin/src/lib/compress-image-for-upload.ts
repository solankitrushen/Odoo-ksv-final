/**
 * Client compress for product image upload only.
 * Call from rentalUploadProductImages — not for previews or display.
 */

const MAX_EDGE = 1600;
const MAX_BYTES_SKIP = 450_000;
const JPEG_QUALITY = 0.82;

export function uploadScale(width: number, height: number, maxEdge = MAX_EDGE): { w: number; h: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { w: width, h: height };
  const scale = maxEdge / longest;
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

function blobToFile(blob: Blob, name: string, type: string): File {
  const base = name.replace(/\.[^.]+$/, "") || "image";
  const ext = type === "image/webp" ? "webp" : type === "image/png" ? "png" : "jpg";
  return new File([blob], `${base}.${ext}`, { type, lastModified: Date.now() });
}

/** Compress / downscale one image for multipart upload. Identity for non-images. */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const { w, h } = uploadScale(bitmap.width, bitmap.height);
    const alreadySmall = file.size <= MAX_BYTES_SKIP && w === bitmap.width && h === bitmap.height;
    if (alreadySmall) return file;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const preferWebp = file.type === "image/webp" || file.type === "image/png";
    const outType = preferWebp ? "image/webp" : "image/jpeg";

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), outType, JPEG_QUALITY);
    });
    if (!blob || blob.size >= file.size) return file;
    return blobToFile(blob, file.name, outType);
  } finally {
    bitmap.close();
  }
}

export async function compressImagesForUpload(files: File[]): Promise<File[]> {
  return Promise.all(files.map((f) => compressImageForUpload(f)));
}
