import { RENTAL_ERROR } from "./constants.js";
import { sendError } from "../Utils/errorResponse.js";

/**
 * Domain error carrying a stable, tenant-safe code from RENTAL_ERROR.
 * Services throw these; the rental error middleware maps them to the envelope.
 */
export class RentalError extends Error {
  constructor(errorKeyOrDef, message, details = undefined) {
    const def =
      typeof errorKeyOrDef === "string" ? RENTAL_ERROR[errorKeyOrDef] : errorKeyOrDef;
    if (!def) throw new Error(`Unknown rental error key: ${errorKeyOrDef}`);
    super(message || def.code);
    this.name = "RentalError";
    this.rental = true;
    this.statusCode = def.http;
    this.code = def.code;
    this.details = details;
  }
}

export function rentalError(key, message, details) {
  return new RentalError(key, message, details);
}

/** Express error middleware for the rental routers. */
export function rentalErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof RentalError || err?.rental) {
    return sendError(res, err.statusCode, err.code, err.message, err.details);
  }
  if (err?.name === "ZodError") {
    const details = (err.issues || []).map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return sendError(res, 400, RENTAL_ERROR.VALIDATION_ERROR.code, "Validation error", details);
  }
  // Duplicate key → tenant-safe conflict.
  if (err?.code === 11000) {
    return sendError(res, 409, RENTAL_ERROR.DUPLICATE_RESOURCE.code, "Duplicate resource");
  }
  if (err?.name === "CastError") {
    return sendError(res, 404, RENTAL_ERROR.RESOURCE_NOT_FOUND.code, "Not found");
  }
  return next(err);
}
