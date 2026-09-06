import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nextMinorBound, setAllowedVersions } from "../src/renovate.ts";

describe("nextMinorBound", () => {
  test("次のマイナーの手前を返す", () => {
    expect(nextMinorBound("1.34")).toBe("<1.35");
    expect(nextMinorBound("v1.9.3")).toBe("<1.10");
    expect(nextMinorBound("2.0")).toBe("<2.1");
  });
});

describe("setAllowedVersions", () => {
  const content = `{
  "packageRules": [
    {
      // dep:allowedVersions kubernetes
      "matchPackageNames": ["kubernetes/kubernetes"],
      "allowedVersions": "<1.33"
    },
    {
      // 別ルール(デコイ)
      "allowedVersions": "<9.9"
    }
  ]
}
`;

  test("マーカー直後のブロックの値だけ置換し、デコイは触らない", () => {
    const r = setAllowedVersions(content, "kubernetes", "<1.35");
    expect(r.changed).toBe(true);
    expect(r.before).toBe("<1.33");
    expect(r.text).toContain('"allowedVersions": "<1.35"');
    expect(r.text).toContain('"allowedVersions": "<9.9"'); // デコイは残る
    expect(r.text).toContain("// dep:allowedVersions kubernetes"); // コメント保持
  });

  test("同じ値なら changed=false で本文も変えない", () => {
    const r = setAllowedVersions(content, "kubernetes", "<1.33");
    expect(r.changed).toBe(false);
    expect(r.text).toBe(content);
  });

  test("allowedVersions行が無ければマーカー直後に挿入する", () => {
    const noAv = `{
  "packageRules": [
    {
      // dep:allowedVersions cilium
      "matchPackageNames": ["cilium"]
    }
  ]
}
`;
    const r = setAllowedVersions(noAv, "cilium", "<1.21");
    expect(r.changed).toBe(true);
    expect(r.before).toBeNull();
    expect(r.text).toContain('"allowedVersions": "<1.21",');
    expect(r.text).toContain('"matchPackageNames": ["cilium"]');
  });

  test("マーカーが無ければ例外", () => {
    expect(() => setAllowedVersions(content, "talos", "<1.15")).toThrow(/マーカー/);
  });
});

describe("dep renovate sync (E2E)", () => {
  const CLI = join(import.meta.dir, "..", "src", "cli.ts");
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dep-renovate-"));
    mkdirSync(join(dir, ".dep"), { recursive: true });
    writeFileSync(join(dir, "versions.yaml"), "kubernetes: v1.34.3\ncilium: 1.19.3\n");
    writeFileSync(
      join(dir, ".dep", "config.yaml"),
      [
        "version: 1",
        "components:",
        "  kubernetes:",
        "    source: { file: versions.yaml, pattern: 'kubernetes: (?<version>\\S+)' }",
        "    renovate: { file: renovate.json5 }",
        "  cilium:",
        "    source: { file: versions.yaml, pattern: 'cilium: (?<version>\\S+)' }",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, ".dep", "matrix.yaml"),
      [
        "version: 1",
        "pivot: kubernetes",
        "releases: {}",
        "components:",
        "  cilium:",
        '    "1.19": { requires: { kubernetes: "1.32..1.35" } }',
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "renovate.json5"),
      [
        "{",
        "  // k8s の上限は dep が管理する",
        '  "packageRules": [',
        "    {",
        "      // dep:allowedVersions kubernetes",
        '      "matchPackageNames": ["kubernetes/kubernetes"],',
        '      "allowedVersions": "<1.34"',
        "    }",
        "  ]",
        "}",
        "",
      ].join("\n"),
    );
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function run(args: string[]) {
    const p = Bun.spawnSync([process.execPath, CLI, ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    return { code: p.exitCode ?? -1, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
  }

  test("--dry-run は書き換えず、差分ありで exit 1", () => {
    const r = run(["renovate", "sync", "--dry-run"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("WOULD");
    expect(readFileSync(join(dir, "renovate.json5"), "utf8")).toContain('"allowedVersions": "<1.34"');
  });

  test("sync は cilium 1.19(1.32..1.35)から上限1.35 → <1.36 を書き込む", () => {
    const r = run(["renovate", "sync"]);
    expect(r.code).toBe(0);
    const after = readFileSync(join(dir, "renovate.json5"), "utf8");
    expect(after).toContain('"allowedVersions": "<1.36"');
    expect(after).toContain("// k8s の上限は dep が管理する"); // コメント保持
    // 2回目は変更なし
    expect(run(["renovate", "sync"]).stdout).toContain("変更なし");
  });
});
