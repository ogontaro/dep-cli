// CLI全体の結線を確認するE2Eテスト。実際に `bun src/cli.ts <args>` をサブプロセスとして起動し、
// 一時ディレクトリに置いた最小構成の .depctl/config.yaml + ソースファイルに対して動かす。
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_PATH = join(import.meta.dir, "..", "src", "cli.ts");

function run(cwd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync([process.execPath, CLI_PATH, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "depctl-cli-"));
  mkdirSync(join(dir, ".depctl"), { recursive: true });
  writeFileSync(
    join(dir, "versions.txt"),
    "platform_version = v2.4.1\nmodule_a_version = 1.7.0\n",
  );
  writeFileSync(
    join(dir, ".depctl", "config.yaml"),
    [
      "version: 1",
      "components:",
      "  platform:",
      "    source:",
      "      file: versions.txt",
      '      pattern: "platform_version = (?<version>\\\\S+)"',
      "  moduleA:",
      "    source:",
      "      file: versions.txt",
      '      pattern: "module_a_version = (?<version>\\\\S+)"',
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, ".depctl", "matrix.yaml"),
    [
      "version: 1",
      "pivot: platform",
      "releases: {}",
      "components:",
      "  moduleA:",
      '    "1.7":',
      "      requires:",
      '        platform: "2.2..2.4"',
      "",
    ].join("\n"),
  );
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("status: 現在バージョンを表示する", () => {
  const result = run(dir, ["status", "--json"]);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ platform: "v2.4.1", moduleA: "1.7.0" });
});

test("check: 妥当ならexit 0", () => {
  const result = run(dir, ["check"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("OK");
});

test("check: 未収録componentがあればexit 1", () => {
  writeFileSync(join(dir, "versions.txt"), "platform_version = v2.4.1\nmodule_a_version = 1.7.0\nmodule_b_version = 9.9.0\n");
  writeFileSync(
    join(dir, ".depctl", "config.yaml"),
    [
      "version: 1",
      "components:",
      "  platform:",
      "    source: { file: versions.txt, pattern: 'platform_version = (?<version>\\S+)' }",
      "  moduleA:",
      "    source: { file: versions.txt, pattern: 'module_a_version = (?<version>\\S+)' }",
      "  moduleB:",
      "    source: { file: versions.txt, pattern: 'module_b_version = (?<version>\\S+)' }",
      "",
    ].join("\n"),
  );
  const result = run(dir, ["check"]);
  expect(result.code).toBe(1);
  expect(result.stdout).toContain("未収録");
});

test("max: pivotの上限を計算する", () => {
  const result = run(dir, ["max", "platform", "--json"]);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout).value).toBe("2.4");
});

test("plan: 到達不可なら理由とexit 1", () => {
  const result = run(dir, ["plan", "--set", "platform=9.9"]);
  expect(result.code).toBe(1);
  expect(result.stdout).toContain("到達不可");
});

test("matrix show/add/rm/validateが連携して動く", () => {
  expect(run(dir, ["matrix", "validate"]).code).toBe(0);

  const added = run(dir, ["matrix", "add", "moduleA", "1.8", "--requires", "platform=2.4..2.6"]);
  expect(added.code).toBe(0);

  const shown = run(dir, ["matrix", "show", "moduleA", "--json"]);
  expect(shown.code).toBe(0);
  expect(JSON.parse(shown.stdout).moduleA["1.8"].requires.platform).toBe("2.4..2.6");

  const removed = run(dir, ["matrix", "rm", "moduleA", "1.8"]);
  expect(removed.code).toBe(0);
  expect(run(dir, ["matrix", "rm", "moduleA", "1.8"]).code).toBe(1); // 二重削除はエラー
});

test("matrix add: matrix.yamlが無い状態でも--pivotで新規作成できる", () => {
  const fresh = mkdtempSync(join(tmpdir(), "depctl-cli-fresh-"));
  try {
    const result = run(fresh, ["matrix", "add", "moduleA", "1.7", "--requires", "platform=2.2..2.4", "--pivot", "platform"]);
    expect(result.code).toBe(0);
    const shown = run(fresh, ["matrix", "show", "--json"]);
    expect(JSON.parse(shown.stdout).pivot).toBe("platform");
  } finally {
    rmSync(fresh, { recursive: true, force: true });
  }
});

test("--help はコマンド一覧を表示する", () => {
  const result = run(dir, ["--help"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("depctl");
});

test("--version はpackage.jsonのversionと一致する(二重管理防止)", async () => {
  const pkg = JSON.parse(await Bun.file(join(import.meta.dir, "..", "package.json")).text());
  const result = run(dir, ["--version"]);
  expect(result.code).toBe(0);
  expect(result.stdout.trim()).toBe(pkg.version);
});
