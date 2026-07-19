import multer from "multer";

const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(
        Object.assign(new Error("Unsupported file type"), {
          code: "OCR_UNSUPPORTED_MIME",
        }),
        false
      );
    }
    cb(null, true);
  },
});

export function uploadOcrImage(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        error: "Payload too large",
        message: "File must be under 10 MB",
      });
    }
    if (err.code === "OCR_UNSUPPORTED_MIME") {
      return res.status(415).json({
        success: false,
        error: "Unsupported media type",
        message: err.message,
      });
    }
    return res.status(400).json({
      success: false,
      error: "Upload failed",
      message: err.message || "Upload failed",
    });
  });
}
