import { describe, it, expect, jest } from "@jest/globals";
import { LlmChain, loadProvidersFromEnv, extractJson } from "../../../src/Rental/services/ai/llmChain.js";

const geminiProvider = { name: "gemini", keys: ["gk1", "gk2"], models: ["gemini-2.0-flash"] };
const groqProvider = { name: "groq", keys: ["qk1"], models: ["llama-3.3-70b-versatile"] };
const openrouterProvider = { name: "openrouter", keys: ["ok1"], models: ["google/gemini-2.0-flash-001"] };

function geminiResp(text) {
  return { data: { candidates: [{ content: { parts: [{ text }] } }] } };
}
function openaiResp(text) {
  return { data: { choices: [{ message: { content: text } }] } };
}
function httpError(status) {
  const err = new Error(`http ${status}`);
  err.response = { status };
  return err;
}

describe("extractJson", () => {
  it("parses raw JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips ```json fences", () => {
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });
  it("extracts first balanced object from noisy text", () => {
    expect(extractJson('here you go: {"a":3, "b":"x"} thanks')).toEqual({ a: 3, b: "x" });
  });
  it("returns null on garbage", () => {
    expect(extractJson("no json here")).toBeNull();
  });
});

describe("loadProvidersFromEnv", () => {
  const OLD = process.env;
  afterEach(() => {
    process.env = OLD;
  });
  it("builds chain order gemini -> groq -> openrouter from keys", () => {
    process.env = { ...OLD, GEMINI_API_KEY: "g", GROQ_API_KEYS: "a,b", OPENROUTER_API_KEY: "o" };
    const provs = loadProvidersFromEnv();
    expect(provs.map((p) => p.name)).toEqual(["gemini", "groq", "openrouter"]);
    expect(provs[1].keys).toEqual(["a", "b"]);
  });
  it("returns empty when no keys set", () => {
    process.env = { ...OLD, GEMINI_API_KEY: "", GEMINI_API_KEYS: "", GROQ_API_KEY: "", GROQ_API_KEYS: "", OPENROUTER_API_KEY: "", OPENROUTER_API_KEYS: "" };
    expect(loadProvidersFromEnv()).toEqual([]);
  });
  it("AI_ONLY_PROVIDERS restricts the set", () => {
    process.env = { ...OLD, GEMINI_API_KEY: "g", GROQ_API_KEY: "q", AI_ONLY_PROVIDERS: "groq" };
    expect(loadProvidersFromEnv().map((p) => p.name)).toEqual(["groq"]);
  });
});

describe("LlmChain.generateText", () => {
  it("returns first provider's text on success", async () => {
    const httpPost = jest.fn().mockResolvedValue(geminiResp("hello"));
    const chain = new LlmChain({ providers: [geminiProvider], httpPost });
    const out = await chain.generateText("hi");
    expect(out).toEqual({ text: "hello", provider: "gemini", model: "gemini-2.0-flash" });
    // Gemini uses key in URL, not Authorization header.
    expect(httpPost.mock.calls[0][0]).toContain("generateContent?key=gk1");
  });

  it("falls through to groq when gemini errors", async () => {
    const httpPost = jest
      .fn()
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValueOnce(openaiResp("from groq"));
    const chain = new LlmChain({ providers: [geminiProvider, groqProvider], httpPost });
    const out = await chain.generateText("hi");
    expect(out.provider).toBe("groq");
    expect(out.text).toBe("from groq");
    // Second call is groq OpenAI-compat endpoint with Bearer auth.
    expect(httpPost.mock.calls[1][0]).toContain("api.groq.com");
    expect(httpPost.mock.calls[1][2].headers.Authorization).toBe("Bearer qk1");
  });

  it("round-robins keys across calls", async () => {
    const httpPost = jest.fn().mockResolvedValue(geminiResp("ok"));
    const chain = new LlmChain({ providers: [geminiProvider], httpPost });
    await chain.generateText("a");
    await chain.generateText("b");
    expect(httpPost.mock.calls[0][0]).toContain("key=gk1");
    expect(httpPost.mock.calls[1][0]).toContain("key=gk2");
  });

  it("cools down a rate-limited slot and skips it next time", async () => {
    const httpPost = jest
      .fn()
      .mockRejectedValueOnce(httpError(429)) // gemini rate limited
      .mockResolvedValueOnce(openaiResp("groq ok")) // groq answers
      .mockResolvedValueOnce(openaiResp("groq ok 2"));
    const single = { name: "gemini", keys: ["gk1"], models: ["gemini-2.0-flash"] };
    const chain = new LlmChain({ providers: [single, groqProvider], httpPost });
    await chain.generateText("first");
    await chain.generateText("second");
    // Second run: gemini slot cooled -> skipped, groq called directly.
    const cooled = chain.getCallLog().some((e) => e.status === "cooldown_skip");
    expect(cooled).toBe(true);
  });

  it("openrouter sends HTTP-Referer + max_tokens", async () => {
    const httpPost = jest.fn().mockResolvedValue(openaiResp("or"));
    const chain = new LlmChain({ providers: [openrouterProvider], httpPost });
    await chain.generateText("hi", { systemPrompt: "be brief" });
    const [, body, config] = httpPost.mock.calls[0];
    expect(config.headers["HTTP-Referer"]).toBeTruthy();
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.messages[0]).toEqual({ role: "system", content: "be brief" });
  });

  it("returns nulls when no providers configured", async () => {
    const chain = new LlmChain({ providers: [] });
    expect(chain.enabled).toBe(false);
    expect(await chain.generateText("x")).toEqual({ text: null, provider: null, model: null });
  });

  it("never leaks the api key into the call log", async () => {
    const httpPost = jest.fn().mockResolvedValue(geminiResp("ok"));
    const chain = new LlmChain({ providers: [geminiProvider], httpPost });
    await chain.generateText("hi");
    const log = JSON.stringify(chain.getCallLog());
    expect(log).not.toContain("gk1");
    expect(log).toContain("1/2"); // key slot label instead
  });
});

describe("LlmChain.generateJson", () => {
  it("parses JSON and validates required keys", async () => {
    const httpPost = jest.fn().mockResolvedValue(geminiResp('{"best":"A","score":9}'));
    const chain = new LlmChain({ providers: [geminiProvider], httpPost });
    const { json, provider } = await chain.generateJson("compare", { requiredKeys: ["best", "score"] });
    expect(json).toEqual({ best: "A", score: 9 });
    expect(provider).toBe("gemini");
  });

  it("retries across chain when first output misses required keys", async () => {
    const httpPost = jest
      .fn()
      .mockResolvedValueOnce(geminiResp('{"wrong":1}'))
      .mockResolvedValueOnce(openaiResp('{"best":"B"}'));
    const chain = new LlmChain({ providers: [geminiProvider, groqProvider], httpPost, maxTokens: 100 });
    const { json } = await chain.generateJson("x", { requiredKeys: ["best"], maxRetries: 2 });
    expect(json).toEqual({ best: "B" });
  });

  it("returns null json when chain cannot produce valid JSON", async () => {
    const httpPost = jest.fn().mockResolvedValue(geminiResp("not json"));
    const chain = new LlmChain({ providers: [geminiProvider], httpPost });
    const { json } = await chain.generateJson("x", { requiredKeys: ["best"], maxRetries: 2 });
    expect(json).toBeNull();
  });
});
