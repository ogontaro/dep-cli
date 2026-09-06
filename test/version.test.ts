import { describe, expect, test } from "bun:test";
import { compareMinor, isPrerelease, parseMinorVersion, toMinorKey } from "../src/version.ts";

describe("parseMinorVersion", () => {
  test("v付き・パッチ付きを解釈できる", () => {
    expect(parseMinorVersion("v1.35.6")).toEqual({ major: 1, minor: 35 });
  });
  test("vなし・パッチなしを解釈できる", () => {
    expect(parseMinorVersion("1.19")).toEqual({ major: 1, minor: 19 });
  });
  test("不正な文字列は例外", () => {
    expect(() => parseMinorVersion("latest")).toThrow();
  });
});

describe("toMinorKey", () => {
  test("major.minorに丸める", () => {
    expect(toMinorKey("v1.35.6")).toBe("1.35");
    expect(toMinorKey("0.29.0")).toBe("0.29");
  });
});

describe("compareMinor", () => {
  test("majorで比較", () => {
    expect(compareMinor("2.0", "1.9")).toBeGreaterThan(0);
  });
  test("minorで比較", () => {
    expect(compareMinor("1.19", "1.20")).toBeLessThan(0);
  });
  test("等しい", () => {
    expect(compareMinor("v1.35.6", "1.35")).toBe(0);
  });
});

describe("isPrerelease", () => {
  test("prerelease識別子付きはtrue", () => {
    expect(isPrerelease("1.21.0-pre.0")).toBe(true);
    expect(isPrerelease("v1.21.0-rc1")).toBe(true);
    expect(isPrerelease("1.21-beta")).toBe(true);
  });
  test("安定版はfalse", () => {
    expect(isPrerelease("1.21.0")).toBe(false);
    expect(isPrerelease("v1.20.1")).toBe(false);
    expect(isPrerelease("1.20")).toBe(false);
  });
});
