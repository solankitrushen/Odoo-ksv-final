// Multi-provider LLM chain with fallback, key round-robin, and JSON-mode output.
//
// Chain order (first configured wins, rest are fallback): Gemini → Groq → OpenRouter.
// Request shapes mirror the Python reference client (hivex ai_provider.py) exactly:
//   - Gemini    : POST generativelanguage .../models/{model}:generateContent?key=KEY
//   - Groq      : POST api.groq.com/openai/v1/chat/completions  (OpenAI-compatible)
//   - OpenRouter: POST openrouter.ai/api/v1/chat/completions    (OpenAI-compatible)
//
// Keys/models come from env only. Multiple comma-separated keys per provider are
// round-robined. On failure/rate-limit we fall through to the next provider; a
// per-(provider,model,key) cooldown avoids hammering a rate-limited slot.
//
// Nothing here mutates domain state. Callers get parsed JSON (generateJson) or raw
// text (generateText); every attempt is recorded in an in-memory call log with the
// key reduced to a slot label ("2/5") so secrets never leak into logs.
import axios from "axios";
import { logger } from "../../../Utils/logger.js";

const GEMINI_URL = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(key)}`;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function env(key) {
  return (process.env[key] || "").trim();
}

function splitKeys(val) {
  const out = [];
  const seen = new Set();
  for (const part of (val || "").split(",")) {
    const p = part.trim();
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

function splitModels(val, fallback) {
  const out = splitKeys(val);
  return out.length ? out : fallback;
}

/**
 * Build the provider registry from env. A provider is included only when it has
 * at least one key. Order is Gemini → Groq → OpenRouter; `AI_ONLY_PROVIDERS`
 * (comma list) can restrict the set. Mirrors the reference client's loader.
 */
export function loadProvidersFromEnv() {
  const providers = [];

  const geminiKeys =
    splitKeys(env("GEMINI_API_KEYS")).length
      ? splitKeys(env("GEMINI_API_KEYS"))
      : env("GEMINI_API_KEY")
        ? [env("GEMINI_API_KEY")]
        : [];
  if (geminiKeys.length) {
    providers.push({
      name: "gemini",
      keys: geminiKeys,
      models: splitModels(env("GEMINI_MODELS") || env("GEMINI_MODEL"), [
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
      ]),
    });
  }

  const groqKeys = splitKeys(env("GROQ_API_KEYS")).length
    ? splitKeys(env("GROQ_API_KEYS"))
    : env("GROQ_API_KEY")
      ? [env("GROQ_API_KEY")]
      : [];
  if (groqKeys.length) {
    providers.push({
      name: "groq",
      keys: groqKeys,
      models: splitModels(env("GROQ_MODELS") || env("GROQ_MODEL"), [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
      ]),
    });
  }

  const openrouterKeys = splitKeys(env("OPENROUTER_API_KEYS")).length
    ? splitKeys(env("OPENROUTER_API_KEYS"))
    : env("OPENROUTER_API_KEY")
      ? [env("OPENROUTER_API_KEY")]
      : [];
  if (openrouterKeys.length) {
    providers.push({
      name: "openrouter",
      keys: openrouterKeys,
      models: splitModels(env("OPENROUTER_MODELS") || env("OPENROUTER_MODEL"), [
        "google/gemini-2.0-flash-001",
        "meta-llama/llama-3.3-70b-instruct",
      ]),
    });
  }

  const allow = splitKeys(env("AI_ONLY_PROVIDERS")).map((s) => s.toLowerCase());
  if (allow.length) {
    return providers.filter((p) => allow.includes(p.name.toLowerCase()));
  }
  return providers;
}

/** Reduce a key to a stable, non-secret slot label like "2/5". */
function keySlot(idx, total) {
  return `${idx + 1}/${total}`;
}

/** Best-effort extraction of the first JSON object/array from model text. */
export function extractJson(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  // Strip ```json fences if present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    // Fall back to first balanced {...} or [...] span.
    const start = body.search(/[{[]/);
    if (start === -1) return null;
    const open = body[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < body.length; i++) {
      const c = body[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(body.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }
}

/**
 * Chain client. Construct once per run; reuse across calls so the call log and
 * cooldown state accumulate. Stateless w.r.t. the DB.
 */
export class LlmChain {
  constructor(options = {}) {
    this.providers = options.providers || loadProvidersFromEnv();
    this.timeoutMs = options.timeoutMs || Number(env("AI_TIMEOUT_MS") || "60000");
    this.temperature = options.temperature ?? 0.4;
    this.maxTokens = options.maxTokens || Number(env("AI_MAX_TOKENS") || "4096");
    this.referer = options.referer || env("OPENROUTER_REFERER") || "https://rental-portal.local";
    this.rlCooldownMs = (Number(env("AI_RL_COOLDOWN_S") || "180")) * 1000;

    this.callLog = [];
    this._keyRr = new Map(); // provider -> next index
    this._cooldown = new Map(); // `${provider}:${model}:${keyIdx}` -> untilEpochMs
    this._httpPost = options.httpPost || ((url, body, config) => axios.post(url, body, config));
  }

  get enabled() {
    return this.providers.length > 0;
  }

  _pickKey(provider) {
    const keys = provider.keys;
    const cur = this._keyRr.get(provider.name) || 0;
    const idx = cur % keys.length;
    this._keyRr.set(provider.name, cur + 1);
    return { key: keys[idx], idx, slot: keySlot(idx, keys.length) };
  }

  _isCooled(provider, model, keyIdx) {
    const until = this._cooldown.get(`${provider}:${model}:${keyIdx}`);
    return until && Date.now() < until;
  }

  _cool(provider, model, keyIdx) {
    this._cooldown.set(`${provider}:${model}:${keyIdx}`, Date.now() + this.rlCooldownMs);
  }

  async _send(provider, model, key, prompt, systemPrompt) {
    if (provider.name === "gemini") return this._callGemini(model, key, prompt, systemPrompt);
    if (provider.name === "groq") return this._callOpenAiCompat(GROQ_URL, model, key, prompt, systemPrompt, "groq");
    if (provider.name === "openrouter")
      return this._callOpenAiCompat(OPENROUTER_URL, model, key, prompt, systemPrompt, "openrouter");
    throw new Error(`unknown provider ${provider.name}`);
  }

  async _callGemini(model, key, prompt, systemPrompt) {
    const body = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
    body.generationConfig = { temperature: this.temperature, maxOutputTokens: this.maxTokens };
    const resp = await this._httpPost(GEMINI_URL(model, key), body, {
      headers: { "Content-Type": "application/json" },
      timeout: this.timeoutMs,
    });
    const cand = resp.data?.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const text = parts.map((p) => p?.text || "").join("").trim();
    return text || null;
  }

  async _callOpenAiCompat(url, model, key, prompt, systemPrompt, name) {
    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });
    const body = {
      model,
      messages,
      temperature: this.temperature,
    };
    // Groq uses max_completion_tokens; OpenRouter uses max_tokens.
    if (name === "groq") body.max_completion_tokens = this.maxTokens;
    else body.max_tokens = this.maxTokens;
    const headers = {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    };
    if (name === "openrouter") headers["HTTP-Referer"] = this.referer;
    const resp = await this._httpPost(url, body, { headers, timeout: this.timeoutMs });
    const content = resp.data?.choices?.[0]?.message?.content;
    return (content || "").trim() || null;
  }

  _isRateLimit(err) {
    const status = err?.response?.status;
    return status === 429 || status === 503;
  }

  /**
   * Try each provider/model/key in order; return the first non-empty text.
   * On error, record it and continue the chain. Rate-limited slots are cooled.
   */
  async generateText(prompt, { systemPrompt = null, accept = null } = {}) {
    if (!this.enabled) return { text: null, provider: null, model: null };
    let lastErr = null;
    for (const provider of this.providers) {
      for (const model of provider.models) {
        const { key, idx, slot } = this._pickKey(provider);
        if (this._isCooled(provider.name, model, idx)) {
          this.callLog.push({ provider: provider.name, model, keySlot: slot, status: "cooldown_skip" });
          continue;
        }
        const t0 = Date.now();
        try {
          const text = await this._send(provider, model, key, prompt, systemPrompt);
          const durationMs = Date.now() - t0;
          if (text) {
            // Optional acceptance gate (e.g. JSON-parses-and-has-required-keys).
            // A rejected response is treated like a miss so the chain continues.
            if (accept) {
              const accepted = accept(text);
              if (accepted !== undefined && accepted !== null && accepted !== false) {
                this.callLog.push({
                  provider: provider.name,
                  model,
                  keySlot: slot,
                  status: "ok",
                  durationMs,
                  chars: text.length,
                });
                return { text, provider: provider.name, model, accepted };
              }
              this.callLog.push({ provider: provider.name, model, keySlot: slot, status: "reject", durationMs });
              continue;
            }
            this.callLog.push({
              provider: provider.name,
              model,
              keySlot: slot,
              status: "ok",
              durationMs,
              chars: text.length,
            });
            return { text, provider: provider.name, model };
          }
          this.callLog.push({ provider: provider.name, model, keySlot: slot, status: "empty", durationMs });
        } catch (err) {
          lastErr = err;
          const rl = this._isRateLimit(err);
          if (rl) this._cool(provider.name, model, idx);
          this.callLog.push({
            provider: provider.name,
            model,
            keySlot: slot,
            status: rl ? "rate_limited" : "error",
            durationMs: Date.now() - t0,
            error: err?.response?.status ? `http_${err.response.status}` : String(err?.code || err?.message || "error"),
          });
        }
      }
    }
    if (lastErr) logger.warn("LLM chain exhausted", { providers: this.providers.map((p) => p.name) });
    return { text: null, provider: null, model: null };
  }

  /**
   * Generate and parse JSON, retrying across the chain until the parsed object
   * contains all `requiredKeys`. Returns { json, provider, model } or nulls.
   */
  async generateJson(prompt, { systemPrompt = null, requiredKeys = [], maxRetries = 2 } = {}) {
    if (!this.enabled) return { json: null, provider: null, model: null };
    const jsonSystem = [
      systemPrompt,
      "Respond with a single valid JSON value only. No prose, no markdown fences.",
    ]
      .filter(Boolean)
      .join("\n\n");

    // Accept only text that parses to JSON containing every required key. A
    // provider returning prose/partial JSON is skipped and the chain advances.
    const accept = (text) => {
      const json = extractJson(text);
      if (!json) return null;
      return requiredKeys.every((k) => Object.prototype.hasOwnProperty.call(json, k)) ? json : null;
    };

    for (let attempt = 0; attempt < Math.max(1, maxRetries); attempt++) {
      const { accepted, provider, model } = await this.generateText(prompt, {
        systemPrompt: jsonSystem,
        accept,
      });
      if (accepted) return { json: accepted, provider, model };
    }
    return { json: null, provider: null, model: null };
  }

  getCallLog() {
    return [...this.callLog];
  }
}

/** Convenience: a shared chain from env for callers that don't need isolation. */
export function createLlmChain(options) {
  return new LlmChain(options);
}
