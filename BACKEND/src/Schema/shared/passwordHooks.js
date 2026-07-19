import bcrypt from "bcrypt";

export async function hashPasswordHook(next) {
  if (!this.isModified("password")) return next();
  try {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;
    this.password = await bcrypt.hash(this.password, rounds);
    next();
  } catch (err) {
    next(err);
  }
}

export function comparePasswordMethod(enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
}
