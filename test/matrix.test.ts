import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  emptyMatrix,
  getRange,
  loadMatrix,
  removeEntry,
  resolveMatrix,
  resolveOrCreateMatrix,
  saveMatrix,
  setEntry,
} from "../src/matrix.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "depctl-matrix-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("save -> loadのラウンドトリップでデータが保たれる", () => {
  const matrix = emptyMatrix("platform");
  setEntry(matrix, "moduleA", "1.7", { requires: { platform: "2.2..2.4" }, source: "https://example.com", retrieved: "2026-09-03" });
  const path = join(dir, "matrix.yaml");
  saveMatrix(path, matrix);
  const loaded = loadMatrix(path);
  expect(loaded).toEqual(matrix);
});

test("setEntryはマイナーキーに正規化して保存する", () => {
  const matrix = emptyMatrix("platform");
  setEntry(matrix, "moduleA", "v1.7.3", { requires: { platform: "2.2..2.4" } });
  expect(Object.keys(matrix.components.moduleA!)).toEqual(["1.7"]);
});

test("getRangeは未収録ならundefined", () => {
  const matrix = emptyMatrix("platform");
  expect(getRange(matrix, "moduleA", "1.7", "platform")).toBeUndefined();
});

test("removeEntryは存在すればtrue、無ければfalse", () => {
  const matrix = emptyMatrix("platform");
  setEntry(matrix, "moduleA", "1.7", { requires: { platform: "2.2..2.4" } });
  expect(removeEntry(matrix, "moduleA", "1.7")).toBe(true);
  expect(removeEntry(matrix, "moduleA", "1.7")).toBe(false);
});

describe("resolveOrCreateMatrix", () => {
  test("matrix.yamlが無ければ--pivot相当の指定で新規作成する", () => {
    const { matrixPath, matrix } = resolveOrCreateMatrix("platform", dir);
    expect(matrix).toEqual(emptyMatrix("platform"));
    expect(matrixPath).toBe(join(dir, ".depctl", "matrix.yaml"));
  });

  test("pivot未指定かつ新規なら例外", () => {
    expect(() => resolveOrCreateMatrix(undefined, dir)).toThrow();
  });

  test("既存があれば読み込む(walk-upで親ディレクトリも探索する)", () => {
    const depctlDir = join(dir, ".depctl");
    mkdirSync(depctlDir, { recursive: true });
    saveMatrix(join(depctlDir, "matrix.yaml"), emptyMatrix("platform"));

    const nested = join(dir, "a", "b");
    mkdirSync(nested, { recursive: true });
    const { matrix } = resolveMatrix(nested);
    expect(matrix.pivot).toBe("platform");
  });
});
