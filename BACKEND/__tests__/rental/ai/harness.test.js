import { describe, it, expect, jest } from "@jest/globals";
import { runHarness, reconcileNumbers, clampNumber } from "../../../src/Rental/services/ai/harness.js";

// A fake chain with a controllable generateJson + call log.
function fakeChain({ enabled = true, json = null } = {}) {
  return {
    enabled,
    generateJson: jest.fn().mockResolvedValue({ json, provider: "gemini", model: "gemini-2.0-flash" }),
    getCallLog: () => [{ provider: "gemini", model: "gemini-2.0-flash", status: json ? "ok" : "empty" }],
  };
}

describe("reconcileNumbers", () => {
  it("forces fact values over model-provided ones", () => {
    const out = reconcileNumbers({ revenuePaise: 999, note: "x" }, { revenuePaise: 500 }, ["revenuePaise"]);
    expect(out.revenuePaise).toBe(500);
    expect(out.note).toBe("x");
  });
});

describe("clampNumber", () => {
  it("clamps into range and defaults non-numbers to min", () => {
    expect(clampNumber(50, 0, 10)).toBe(10);
    expect(clampNumber(-5, 0, 10)).toBe(0);
    expect(clampNumber("abc", 2, 10)).toBe(2);
  });
});

describe("runHarness", () => {
  const baseSpec = {
    name: "test",
    gatherContext: async () => ({ revenuePaise: 1000 }),
    buildPrompt: () => ({ system: "sys", user: "usr", requiredKeys: ["best"] }),
  };

  it("runs the full pipeline and approves", async () => {
    const chain = fakeChain({ json: { best: "A", revenuePaise: 1000 } });
    const out = await runHarness(
      {
        ...baseSpec,
        chain,
        validate: (j, f) => reconcileNumbers(j, f, ["revenuePaise"]),
        guard: (j) => j,
        approve: (j) => ({ approved: true, score: 0.9 }),
      },
      { productId: "p1" }
    );
    expect(out.ok).toBe(true);
    expect(out.result).toEqual({ best: "A", revenuePaise: 1000 });
    expect(out.run.stages.map((s) => s.stage)).toEqual([
      "gatherContext",
      "buildPrompt",
      "generate",
      "validate",
      "guard",
      "approve",
    ]);
  });

  it("neutralises a hallucinated number via reconcile (fact wins)", async () => {
    const chain = fakeChain({ json: { best: "A", revenuePaise: 999999 } });
    const out = await runHarness(
      { ...baseSpec, chain, validate: (j, f) => reconcileNumbers(j, f, ["revenuePaise"]) },
      {}
    );
    expect(out.result.revenuePaise).toBe(1000); // fact, not the model's 999999
  });

  it("falls back to heuristic when chain is disabled (no keys)", async () => {
    const chain = fakeChain({ enabled: false });
    const out = await runHarness(
      { ...baseSpec, chain, heuristic: async () => ({ best: "H", revenuePaise: 1000 }) },
      {}
    );
    expect(out.ok).toBe(true);
    expect(out.run.usedHeuristic).toBe(true);
    expect(out.result.best).toBe("H");
    expect(out.run.stages.find((s) => s.stage === "generate").status).toBe("skipped_no_key");
  });

  it("falls back to heuristic when the chain returns no JSON", async () => {
    const chain = fakeChain({ enabled: true, json: null });
    const out = await runHarness(
      { ...baseSpec, chain, heuristic: async () => ({ best: "H" }) },
      {}
    );
    expect(out.run.usedHeuristic).toBe(true);
    expect(out.result.best).toBe("H");
  });

  it("marks needs_review when approve gate rejects", async () => {
    const chain = fakeChain({ json: { best: "A" } });
    const out = await runHarness(
      { ...baseSpec, chain, approve: () => ({ approved: false, score: 0.2, reasons: ["low confidence"] }) },
      {}
    );
    expect(out.ok).toBe(false);
    expect(out.review.reasons).toContain("low confidence");
  });

  it("fails closed when validate throws", async () => {
    const chain = fakeChain({ json: { best: "A" } });
    const out = await runHarness(
      {
        ...baseSpec,
        chain,
        validate: () => {
          throw new Error("schema mismatch");
        },
      },
      {}
    );
    expect(out.ok).toBe(false);
    expect(out.result).toBeNull();
  });

  it("errors when no AI output and no heuristic", async () => {
    const chain = fakeChain({ enabled: false });
    const out = await runHarness({ ...baseSpec, chain }, {});
    expect(out.ok).toBe(false);
    expect(out.review.reasons[0]).toContain("generate");
  });
});
