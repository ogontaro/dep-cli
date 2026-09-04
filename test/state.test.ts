import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DepctlConfig } from "../src/config.ts";
import { readState } from "../src/state.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "depctl-state-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("named captureで各componentの現在バージョンを読み取る", () => {
  writeFileSync(
    join(dir, "versions.tf"),
    [
      'variable "platform_version" {',
      '  default = "v2.4.1" # depctl: version',
      "}",
      "",
      'variable "module_a_version" {',
      '  default = "v1.7.0" # depctl: version',
      "}",
    ].join("\n"),
  );

  const config: DepctlConfig = {
    version: 1,
    components: {
      platform: { source: { file: "versions.tf", pattern: 'platform_version"[\\s\\S]*?default\\s*=\\s*"v(?<version>[0-9.]+)"' } },
      moduleA: { source: { file: "versions.tf", pattern: 'module_a_version"[\\s\\S]*?default\\s*=\\s*"v(?<version>[0-9.]+)"' } },
    },
  };

  const state = readState(dir, config);
  expect(state).toEqual({ platform: "2.4.1", moduleA: "1.7.0" });
});

test("マッチしなければcomponent名を含むエラー", () => {
  writeFileSync(join(dir, "versions.tf"), "no version here");
  const config: DepctlConfig = {
    version: 1,
    components: { platform: { source: { file: "versions.tf", pattern: "(?<version>never-matches)" } } },
  };
  expect(() => readState(dir, config)).toThrow(/platform/);
});

test("ファイルが存在しなければcomponent名を含むエラー", () => {
  const config: DepctlConfig = {
    version: 1,
    components: { platform: { source: { file: "missing.tf", pattern: "(?<version>.*)" } } },
  };
  expect(() => readState(dir, config)).toThrow(/platform/);
});
