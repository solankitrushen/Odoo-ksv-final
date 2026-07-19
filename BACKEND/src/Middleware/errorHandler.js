import { logger } from "../Utils/logger.js";

const showStack = () => process.env.DEBUG_ERROR_STACK === "true";

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: "Not found",
    message: `${req.method} ${req.path} not found`,
  });
}

export function errorHandler(err, req, res, _next) {
  logger.error("Unhandled error", {
    message: err.message,
    path: req.path,
    ...(showStack() && { stack: err.stack }),
  });

  if (err.name === "ValidationError") {
    const details = Object.entries(err.errors || {}).map(([field, e]) => ({
      field,
      message: e.message,
    }));
    return res.status(400).json({
      success: false,
      error: "Validation error",
      details,
    });
  }

  if (err.name === "CastError") {
    return res.status(404).json({
      success: false,
      error: "Not found",
      message: "Invalid resource id",
    });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    return res.status(409).json({
      success: false,
      error: "Duplicate key",
      message: `${field} already exists`,
    });
  }

  const status = err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: err.message || "Internal server error",
    ...(showStack() && { stack: err.stack }),
  });
}
