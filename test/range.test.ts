import { describe, expect, test } from "bun:test";
import { formatRange, parseRange, rangeContains } from "../src/range.ts";

describe("parseRange", () => {
  test("min..maxを解釈する", () => {
    expect(parseRange("1.32..1.35")).toEqual({ min: "1.32", max: "1.35" });
  });
  test("v付き・パッチ付きも正規化する", () => {
    expect(parseRange("v1.32.0..v1.35.9")).toEqual({ min: "1.32", max: "1.35" });
  });
  test("区切りが無ければ例外", () => {
    expect(() => parseRange("1.32")).toThrow();
  });
  test("minがmaxを超えていれば例外", () => {
    expect(() => parseRange("1.35..1.32")).toThrow();
  });
});

describe("rangeContains", () => {
  const r = parseRange("1.32..1.35");
  test("範囲内", () => {
    expect(rangeContains(r, "1.33")).toBe(true);
    expect(rangeContains(r, "v1.35.6")).toBe(true); // パッチ違いは無視、境界含む
    expect(rangeContains(r, "1.32")).toBe(true); // 下端含む
  });
  test("範囲外", () => {
    expect(rangeContains(r, "1.31")).toBe(false);
    expect(rangeContains(r, "1.36")).toBe(false);
  });
});

test("formatRangeはparseRangeの逆変換になる", () => {
  expect(formatRange(parseRange("1.32..1.35"))).toBe("1.32..1.35");
});
