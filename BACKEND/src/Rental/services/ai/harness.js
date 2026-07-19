// AI Harness — a small, testable pipeline that wraps the raw LLM chain with the
// stages every feature needs, so no analyzer/chatbot calls the model directly:
//
//   input
//     │
//     ▼
//   Harness.run
//     ├── detectIntent      (classify the request; caller-supplied)
//     ├── gatherContext     (server-owned tool reads — deterministic, no LLM)
//     ├── buildPrompt       (assemble system + user prompt from context)
//     ├── generate          (LlmChain.generateJson — chain fallback)
//     ├── validate          (schema/required keys + reconcile against tool facts)
//     ├── guard             (clamp numbers, strip disallowed fields, injection check)
//     └── approve           (final gate; below-threshold => needsHumanReview)
//         │
//         ▼
//   { ok, result, review, run }
//
// Guardrail rule: the LLM ranks and explains, it never invents authoritative
// numbers. Any figure the LLM returns is reconciled against `context` facts; a
// mismatch is rejected (fact wins), so a hallucinated or injected value can
// never reach the caller. Every run yields a redacted `run` record for audit.
import { logger } from "../../../Utils/logger.js";
import { LlmChain } from "./llmChain.js";

/** A stage failed in a way that should abort the pipeline with a reason. */
export class HarnessError extends Error {
  constructor(stage, message) {
    super(message);
    this.name = "HarnessError";
    this.stage = stage;
  }
}

/**
 * Run a guarded AI pipeline.
 *
 * @param {object} spec
 *  - name: string label for logs/audit
 *  - chain: LlmChain (defaults to env-configured)
 *  - detectIntent?: (input) => intent            (sync/async; optional)
 *  - gatherContext: (input, intent) => facts     (server-owned tool reads)
 *  - buildPrompt: (input, intent, facts) => { system, user, requiredKeys }
 *  - validate?: (json, facts) => json|throws     (schema + reconcile)
 *  - guard?: (json, facts) => json               (clamp/strip; must not throw)
 *  - approve?: (json, facts) => { approved, score?, reasons? }
 *  - heuristic?: (input, intent, facts) => json  (fallback when AI unavailable)
 * @param {*} input caller payload
 */
export async function runHarness(spec, input) {
  const chain = spec.chain || new LlmChain();
  const run = {
    name: spec.name,
    stages: [],
    provider: null,
    model: null,
    usedHeuristic: false,
    startedAt: new Date().toISOString(),
  };
  const mark = (stage, status, extra = {}) => run.stages.push({ stage, status, ...extra });

  try {
    // 1. detect intent (optional)
    let intent = null;
    if (spec.detectIntent) {
      intent = await spec.detectIntent(input);
      mark("detectIntent", "ok", { intent: typeof intent === "string" ? intent : undefined });
    }

    // 2. gather context — deterministic, server-owned. No LLM here.
    const facts = await spec.gatherContext(input, intent);
    mark("gatherContext", "ok");

    // 3. build prompt
    const { system, user, requiredKeys = [] } = spec.buildPrompt(input, intent, facts);
    mark("buildPrompt", "ok");

    // 4. generate (or heuristic fallback)
    let json = null;
    if (chain.enabled) {
      const res = await chain.generateJson(user, {
        systemPrompt: system,
        requiredKeys,
        maxRetries: 2,
      });
      json = res.json;
      run.provider = res.provider;
      run.model = res.model;
      mark("generate", json ? "ok" : "empty", { provider: res.provider, model: res.model });
    } else {
      mark("generate", "skipped_no_key");
    }

    if (!json) {
      if (spec.heuristic) {
        json = await spec.heuristic(input, intent, facts);
        run.usedHeuristic = true;
        mark("heuristic", "ok");
      } else {
        throw new HarnessError("generate", "no AI output and no heuristic fallback");
      }
    }

    // 5. validate — schema + reconcile against facts (throws to reject)
    if (spec.validate && !run.usedHeuristic) {
      json = spec.validate(json, facts);
      mark("validate", "ok");
    }

    // 6. guard — clamp/strip; never throws
    if (spec.guard) {
      json = spec.guard(json, facts);
      mark("guard", "ok");
    }

    // 7. approve gate
    let review = { approved: true, score: null, reasons: [] };
    if (spec.approve) {
      review = { reasons: [], ...(await spec.approve(json, facts)) };
      mark("approve", review.approved ? "approved" : "needs_review", { score: review.score });
    } else {
      mark("approve", "approved");
    }

    run.finishedAt = new Date().toISOString();
    run.callLog = chain.getCallLog();
    return { ok: review.approved, result: json, review, run };
  } catch (err) {
    const stage = err instanceof HarnessError ? err.stage : "unknown";
    mark(stage, "error", { error: String(err?.message || err) });
    run.finishedAt = new Date().toISOString();
    run.callLog = chain.getCallLog?.() || [];
    logger.warn("AI harness failed", { name: spec.name, stage, error: String(err?.message || err) });
    return { ok: false, result: null, review: { approved: false, reasons: [`${stage}: ${err?.message}`] }, run };
  }
}

/**
 * Reconcile helper: assert that every key in `mustMatch` present in `json` equals
 * the authoritative value in `facts`. Returns the json with those keys forced to
 * the fact value (fact always wins), so a hallucinated/injected number is neutralised.
 */
export function reconcileNumbers(json, facts, keys) {
  const out = { ...json };
  for (const k of keys) {
    if (facts[k] !== undefined) out[k] = facts[k];
  }
  return out;
}

/** Clamp a numeric field into [min, max]. Non-numbers become `min`. */
export function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
