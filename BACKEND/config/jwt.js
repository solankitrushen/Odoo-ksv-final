export function getJwtConfig() {
  return {
    secret: process.env.JWT_SECRET,
    accessExpire: process.env.JWT_EXPIRE || "7d",
    refreshExpire: process.env.REFRESH_TOKEN_EXPIRE || "30d",
    algorithm: "HS256",
  };
}

export function assertJwtConfig() {
  const { secret } = getJwtConfig();
  if (!secret) {
    throw new Error("JWT_SECRET must be set for InstaCafe auth");
  }
  const minLen = process.env.NODE_ENV === "production" ? 32 : 16;
  if (secret.length < minLen) {
    throw new Error(
      `JWT_SECRET must be at least ${minLen} characters (NODE_ENV=${process.env.NODE_ENV || "development"})`
    );
  }
}
