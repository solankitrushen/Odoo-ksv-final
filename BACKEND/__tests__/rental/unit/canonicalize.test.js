import { describe, it, expect } from "@jest/globals";
import {
  canonicalJson,
  canonicalHash,
  rupeeStringToPaise,
} from "../../../src/Rental/services/canonicalize.js";

describe("canonicalize — key order & omission", () => {
  it("sorts keys at every depth and omits undefined", () => {
    const a = canonicalJson({ b: 1, a: { d: undefined, c: 2 }, arr: [3, undefined, 1] });
    expect(a).toBe('{"a":{"c":2},"arr":[3,1],"b":1}');
  });
  it("hash is stable across key insertion order", () => {
    const h1 = canonicalHash({ x: 1, y: { m: 2, n: 3 } });
    const h2 = canonicalHash({ y: { n: 3, m: 2 }, x: 1 });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
  it("preserves explicit zero and false and null", () => {
    expect(canonicalJson({ a: 0, b: false, c: null })).toBe('{"a":0,"b":false,"c":null}');
  });
  it("rejects NaN / Infinity", () => {
    expect(() => canonicalJson({ a: NaN })).toThrow();
    expect(() => canonicalJson({ a: Infinity })).toThrow();
  });
  it("does not mutate the source object", () => {
    const src = { b: 1, a: 2 };
    canonicalJson(src);
    expect(Object.keys(src)).toEqual(["b", "a"]);
  });
});

describe("rupeeStringToPaise — strict two-decimal parser", () => {
  it.each([
    ["0", 0],
    ["0.01", 1],
    ["120.00", 12000],
    ["120", 12000],
    ["30000", 3000000],
    ["1.5", 150],
    ["00120.00", 12000],
  ])("%s → %d paise", (input, expected) => {
    expect(rupeeStringToPaise(input)).toBe(expected);
  });
  it.each(["1.234", "1e3", "-1.00", " 1.00", "1.00 ", "abc", "", "1,000.00"])(
    "rejects %s",
    (bad) => {
      expect(() => rupeeStringToPaise(bad)).toThrow();
    }
  );
  it("rejects non-string", () => {
    expect(() => rupeeStringToPaise(120)).toThrow();
  });
});
