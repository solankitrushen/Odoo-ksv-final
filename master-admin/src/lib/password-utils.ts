const LOWER = "abcdefghijkmnopqrstuvwxyz";
const NUMS = "23456789";
const SYMS = "!@#$%^&*";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function pickOne(set: string): string {
  const idx = Math.floor(Math.random() * set.length);
  return set[idx];
}

function shuffle(input: string): string {
  const arr = input.split("");
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

export function generateStrongPassword(length = 14): string {
  const base =
    pickOne(UPPER) +
    pickOne(LOWER) +
    pickOne(NUMS) +
    pickOne(SYMS);
  const pool = UPPER + LOWER + NUMS + SYMS;
  let rest = "";
  for (let i = base.length; i < length; i += 1) {
    rest += pickOne(pool);
  }
  return shuffle(base + rest);
}
