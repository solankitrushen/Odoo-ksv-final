import { randomToken } from "./crypto.js";

const store = new Map();
const TTL_MS = 10 * 60 * 1000;

export function createOAuthState() {
  const state = randomToken(16);
  store.set(state, Date.now() + TTL_MS);
  return state;
}

export function consumeOAuthState(state) {
  if (!state) return false;
  const exp = store.get(state);
  store.delete(state);
  return exp && Date.now() < exp;
}
