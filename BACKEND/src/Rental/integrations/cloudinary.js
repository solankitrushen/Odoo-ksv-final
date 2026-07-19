// Cloudinary uploader for rental product images (admin).
import { v2 as cloudinary } from "cloudinary";
import { rentalError } from "../errors.js";

function ensureConfigured() {
  const cloud_name = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const api_key = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const api_secret = String(process.env.CLOUDINARY_API_SECRET || "").trim();
  if (!cloud_name || !api_key || !api_secret) {
    throw rentalError(
      "PROVIDER_NOT_CONFIGURED",
      "Cloudinary is not configured (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)"
    );
  }
  // Always re-apply — avoids stale empty key after .env edits / duplicate vars.
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  return cloudinary;
}

/**
 * Upload one image buffer to Cloudinary.
 * @returns {{ url: string, publicId: string, width?: number, height?: number }}
 */
export async function uploadImageBuffer(tenantId, buffer, { filename, mime, folder } = {}) {
  const cld = ensureConfigured();
  const dest = folder || `rental/${tenantId}/products`;

  const result = await new Promise((resolve, reject) => {
    const stream = cld.uploader.upload_stream(
      {
        folder: dest,
        resource_type: "image",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        transformation: [{ quality: "auto", fetch_format: "auto" }],
        ...(filename ? { public_id: filename.replace(/\.[^.]+$/, "").slice(0, 80) } : {}),
      },
      (err, res) => (err ? reject(err) : resolve(res))
    );
    stream.end(buffer);
  });

  void mime;
  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
  };
}

export async function uploadProductImageBuffer(tenantId, buffer, opts = {}) {
  return uploadImageBuffer(tenantId, buffer, { ...opts, folder: `rental/${tenantId}/products` });
}

export async function uploadInspectionImageBuffer(tenantId, rentalId, buffer, opts = {}) {
  return uploadImageBuffer(tenantId, buffer, {
    ...opts,
    folder: `rental/${tenantId}/inspections/${rentalId}`,
  });
}
