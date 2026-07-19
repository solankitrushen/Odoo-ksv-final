import multer from "multer";
import { sendError } from "../../Utils/errorResponse.js";
import { RENTAL_ERROR } from "../constants.js";

const ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(
        Object.assign(new Error("Only jpeg/png/webp images allowed"), { code: "PRODUCT_UNSUPPORTED_MIME" }),
        false
      );
    }
    cb(null, true);
  },
});

/** Accept field `images` (1–10) or single `file`. */
export function uploadProductImages(req, res, next) {
  upload.fields([
    { name: "images", maxCount: 10 },
    { name: "file", maxCount: 1 },
  ])(req, res, (err) => {
    if (!err) {
      const fromImages = req.files?.images || [];
      const fromFile = req.files?.file || [];
      req.productImageFiles = [...fromImages, ...fromFile];
      if (!req.productImageFiles.length) {
        return sendError(res, 400, RENTAL_ERROR.VALIDATION_ERROR.code, "No image file provided (use images or file)");
      }
      return next();
    }
    if (err.code === "LIMIT_FILE_SIZE") {
      return sendError(res, 413, RENTAL_ERROR.VALIDATION_ERROR.code, "Each image must be under 5 MB");
    }
    if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
      return sendError(res, 400, RENTAL_ERROR.VALIDATION_ERROR.code, err.message || "Too many files");
    }
    if (err.code === "PRODUCT_UNSUPPORTED_MIME") {
      return sendError(res, 415, RENTAL_ERROR.VALIDATION_ERROR.code, err.message);
    }
    return sendError(res, 400, RENTAL_ERROR.VALIDATION_ERROR.code, err.message || "Upload failed");
  });
}
