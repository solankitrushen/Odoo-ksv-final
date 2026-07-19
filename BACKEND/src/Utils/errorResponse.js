export function sendError(res, statusCode, error, message, details = undefined) {
  const body = { success: false, error, message };
  if (details) body.details = details;
  return res.status(statusCode).json(body);
}

export function sendSuccess(res, statusCode, data = {}) {
  return res.status(statusCode).json({ success: true, data });
}
