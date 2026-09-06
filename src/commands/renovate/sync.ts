import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "../../config.ts";
import { readState } from "../../state.ts";
import { loadMatrix } from "../../matrix.ts";
import { computeMaxComponent, computeMaxPivot } from "../../compat.ts";
import { nextMinorBound, setAllowedVersions } from "../../renovate.ts";
import { printJson } from "../../format.ts";

interface Entry {
  component: string;
  file: string;
  desired?: string;
  before?: string | null;
  changed?: boolean;
  error?: string;
}

// config.yaml で renovate: が設定された各 component の許容上限(dep max)を計算し、
// renovate設定ファイルの allowedVersions を更新する。
export function run(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: { json: { type: "boolean" }, "dry-run": { type: "boolean" } },
  });
  const dryRun = values["dry-run"] ?? false;

  const { root, config, matrixPath } = loadConfig();
  const state = readState(root, config);
  const matrix = loadMatrix(matrixPath);

  const targets = Object.entries(config.components).filter(([, c]) => c.renovate);
  if (targets.length === 0) {
    throw new Error("config.yaml のどの component にも renovate: が設定されていません");
  }

  const contents = new Map<string, string>(); // abs path -> (更新後の)内容
  const results: Entry[] = [];

  for (const [name, c] of targets) {
    const rel = c.renovate!.file;
    const abs = join(root, rel);
    if (!contents.has(abs)) {
      try {
        contents.set(abs, readFileSync(abs, "utf8"));
      } catch {
        results.push({ component: name, file: rel, error: `renovate設定を読み込めません: ${abs}` });
        continue;
      }
    }

    const max = name === matrix.pivot ? computeMaxPivot(matrix, state) : computeMaxComponent(matrix, state, name);
    if (max.value === undefined) {
      results.push({ component: name, file: rel, error: max.errors[0] ?? `${name} の上限を計算できません` });
      continue;
    }

    const desired = nextMinorBound(max.value);
    try {
      const r = setAllowedVersions(contents.get(abs)!, name, desired);
      contents.set(abs, r.text);
      results.push({ component: name, file: rel, desired, before: r.before, changed: r.changed });
    } catch (e) {
      results.push({ component: name, file: rel, error: (e as Error).message });
    }
  }

  const anyError = results.some((r) => r.error);
  const anyChange = results.some((r) => r.changed);

  if (!dryRun && anyChange) {
    for (const [abs, text] of contents) writeFileSync(abs, text, "utf8");
  }

  if (values.json) {
    printJson({ dryRun, results });
  } else {
    for (const r of results) {
      if (r.error) {
        console.log(`NG  ${r.component}: ${r.error}`);
      } else if (r.changed) {
        console.log(
          `${dryRun ? "WOULD " : "SET   "}${r.component}: allowedVersions ${r.before ?? "(なし)"} -> "${r.desired}"  (${r.file})`,
        );
      } else {
        console.log(`OK    ${r.component}: allowedVersions "${r.desired}" (変更なし)`);
      }
    }
  }

  // エラー、または dry-run で差分ありなら非ゼロ(CIゲート用)。
  if (anyError || (dryRun && anyChange)) process.exit(1);
}
