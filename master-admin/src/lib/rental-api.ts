import { apiFetch } from "@/lib/backend-fetch";
import { compressImageForUpload, compressImagesForUpload } from "@/lib/compress-image-for-upload";
import type { CommandOptions, PageResult, QueryParams } from "@/lib/rental-types";

export const RENTAL_BASE = "/rental";

export type InspectionAngle = "front" | "side" | "back";

/** Multipart product image upload → Cloudinary URLs for create/patch `images`. Compresses here only. */
export async function rentalUploadProductImages(files: FileList | File[]): Promise<string[]> {
  const list = Array.from(files);
  if (!list.length) return [];
  const compressed = await compressImagesForUpload(list);
  const fd = new FormData();
  for (const f of compressed) fd.append("images", f);
  const out = await apiFetch<{ urls?: string[] }>(rentalUrl("/admin/products/images"), {
    method: "POST",
    body: fd,
  });
  return Array.isArray(out.urls) ? out.urls : [];
}

const JPEG_EXT = /\.jpe?g$/i;
const JPEG_MIME = new Set(["image/jpeg", "image/jpg"]);

export function isJpegFile(file: File): boolean {
  return JPEG_MIME.has((file.type || "").toLowerCase()) || JPEG_EXT.test(file.name);
}

/** Accept only JPEG; normalize MIME so multipart never 415s on empty browser type. */
export function asInspectionJpeg(file: File): File {
  if (!isJpegFile(file)) {
    throw new Error("Only JPEG (.jpg / .jpeg) photos are allowed");
  }
  if (file.type === "image/jpeg") return file;
  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([file], `${base}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
}

/**
 * Upload one inspection angle (select → queue → Cloudinary).
 * Compresses client-side first to cut timeout risk on large phone photos.
 */
export async function rentalUploadInspectionPhoto(
  rentalId: string,
  angle: InspectionAngle,
  file: File,
  init?: { signal?: AbortSignal }
): Promise<string> {
  const jpeg = asInspectionJpeg(file);
  const compressed = await compressImageForUpload(jpeg);
  const ready = asInspectionJpeg(compressed);
  const fd = new FormData();
  fd.append("file", ready, ready.name);
  const out = await apiFetch<{ url: string; angle: string }>(
    rentalUrl(`/admin/rentals/${rentalId}/inspection/photos/${angle}`),
    { method: "POST", body: fd, signal: init?.signal }
  );
  if (!out?.url) throw new Error(`Upload failed for ${angle}`);
  return out.url;
}

/** @deprecated Prefer per-angle `rentalUploadInspectionPhoto` (upload-on-select). */
export async function rentalUploadInspectionPhotos(
  rentalId: string,
  files: { front: File; side: File; back: File }
): Promise<{ front: string; side: string; back: string }> {
  const [front, side, back] = await Promise.all([
    rentalUploadInspectionPhoto(rentalId, "front", files.front),
    rentalUploadInspectionPhoto(rentalId, "side", files.side),
    rentalUploadInspectionPhoto(rentalId, "back", files.back),
  ]);
  return { front, side, back };
}

export function rentalUrl(path: string, params: QueryParams = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params).sort(([a], [b]) => a.localeCompare(b))) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  return `${RENTAL_BASE}${path}${search.size ? `?${search}` : ""}`;
}

export function createIntentKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `intent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function commandHeaders(options: CommandOptions = {}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  if (options.version !== undefined) headers["If-Match"] = `"${options.version}"`;
  return headers;
}

export async function rentalGet<T>(path: string, params: QueryParams = {}): Promise<T> {
  return apiFetch<T>(rentalUrl(path, params));
}

export async function rentalCommand<T>(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown, options: CommandOptions = {}): Promise<T> {
  return apiFetch<T>(rentalUrl(path), {
    method,
    headers: commandHeaders(options),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function normalizePage<T>(value: PageResult<T> | T[] | { items?: T[]; total?: number; page?: number; limit?: number }): PageResult<T> {
  if (Array.isArray(value)) return { items: value, total: value.length, page: 1, limit: value.length || 25 };
  const items = Array.isArray(value.items) ? value.items : [];
  return { items, total: value.total ?? items.length, page: value.page ?? 1, limit: value.limit ?? 25 };
}
