import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findDepctlDir, loadConfig } from "../src/config.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "depctl-config-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("findDepctlDirはcwdから親方向へ.depctlを探索する(git方式)", () => {
  mkdirSync(join(dir, ".depctl"), { recursive: true });
  const nested = join(dir, "a", "b", "c");
  mkdirSync(nested, { recursive: true });
  expect(findDepctlDir(nested)).toBe(join(dir, ".depctl"));
});

test("見つからなければ例外", () => {
  expect(() => findDepctlDir(dir)).toThrow();
});

describe("loadConfig", () => {
  test("config.yamlを読み込む", () => {
    const depctlDir = join(dir, ".depctl");
    mkdirSync(depctlDir, { recursive: true });
    writeFileSync(
      join(depctlDir, "config.yaml"),
      `version: 1\ncomponents:\n  platform:\n    source:\n      file: versions.txt\n      pattern: 'platform=(?<version>\\S+)'\n`,
    );
    const discovered = loadConfig(dir);
    expect(discovered.root).toBe(dir);
    expect(discovered.config.components.platform?.source.file).toBe("versions.txt");
  });

  test("config.yamlが無ければ例外", () => {
    mkdirSync(join(dir, ".depctl"), { recursive: true });
    expect(() => loadConfig(dir)).toThrow();
  });
});
