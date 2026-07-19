/** Zod body validator middleware. */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.errors.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details,
      });
    }
    req.validated = result.data;
    next();
  };
}
