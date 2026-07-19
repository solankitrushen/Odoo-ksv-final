import multer from "multer";
import { sendError } from "../../Utils/errorResponse.js";
import { RENTAL_ERROR } from "../constants.js";

const JPEG_MIME = new Set(["image/jpeg", "image/jpg"]);
const ANGLES = new Set(["front", "side", "back"]);

function isJpegFile(file) {
  if (JPEG_MIME.has(String(file.mimetype || "").toLowerCase())) return true;
  // Some browsers send an empty MIME; accept by extension so valid JPGs aren't 415'd.
  const name = String(file.originalname || "").toLowerCase();
  return name.endsWith(".jpg") || name.endsWith(".jpeg");
}

function multerError(err, res) {
  if (err.code === "LIMIT_FILE_SIZE") {
    return sendError(res, 413, RENTAL_ERROR.VALIDATION_ERROR.code, "Each image must be under 5 MB");
  }
  if (err.code === "INSPECT_UNSUPPORTED_MIME") {
    return sendError(res, 415, RENTAL_ERROR.VALIDATION_ERROR.code, err.message);
  }
  return sendError(res, 400, RENTAL_ERROR.VALIDATION_ERROR.code, err.message || "Upload failed");
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
  fileFilter(_req, file, cb) {
    if (!isJpegFile(file)) {
      return cb(
        Object.assign(new Error("Only JPEG (.jpg / .jpeg) images allowed"), {
          code: "INSPECT_UNSUPPORTED_MIME",
        }),
        false
      );
    }
    cb(null, true);
  },
});

/** Require multipart fields: front, side, back (one JPEG each). */
export function uploadInspectionPhotos(req, res, next) {
  upload.fields([
    { name: "front", maxCount: 1 },
    { name: "side", maxCount: 1 },
    { name: "back", maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return multerError(err, res);
    const front = req.files?.front?.[0];
    const side = req.files?.side?.[0];
    const back = req.files?.back?.[0];
    if (!front || !side || !back) {
      return sendError(
        res,
        400,
        RENTAL_ERROR.VALIDATION_ERROR.code,
        "Inspection requires front, side, and back image files"
      );
    }
    req.inspectionPhotoFiles = { front, side, back };
    return next();
  });
}

/**
 * Single-angle upload: multipart field `file` or the angle name (`front`|`side`|`back`).
 * Params: :angle
 */
export function uploadInspectionPhotoOne(req, res, next) {
  const angle = String(req.params.angle || "").toLowerCase();
  if (!ANGLES.has(angle)) {
    return sendError(res, 400, RENTAL_ERROR.VALIDATION_ERROR.code, "Angle must be front, side, or back");
  }
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: angle, maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return multerError(err, res);
    const file = req.files?.file?.[0] || req.files?.[angle]?.[0];
    if (!file) {
      return sendError(
        res,
        400,
        RENTAL_ERROR.VALIDATION_ERROR.code,
        `Missing JPEG file for ${angle} (use field "file" or "${angle}")`
      );
    }
    req.inspectionPhotoAngle = angle;
    req.inspectionPhotoFile = file;
    return next();
  });
}
