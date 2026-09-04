import { parseArgs } from "node:util";
import { resolveMatrix } from "../../matrix.ts";
import { parseRange } from "../../range.ts";
import { toMinorKey } from "../../version.ts";
import { printJson } from "../../format.ts";

export function run(argv: string[]): void {
  const { values } = parseArgs({ args: argv, options: { json: { type: "boolean" } } });
  const { matrixPath, matrix } = resolveMatrix();
  const errors: string[] = [];

  for (const [comp, versions] of Object.entries(matrix.components)) {
    for (const [v, entry] of Object.entries(versions)) {
      const label = `${comp}@${v}`;
      try {
        if (toMinorKey(v) !== v) errors.push(`${label}: バージョンキーはマイナー粒度("major.minor")である必要があります`);
      } catch {
        errors.push(`${label}: バージョンキーを解釈できません`);
      }
      const requiresEntries = Object.entries(entry.requires ?? {});
      if (requiresEntries.length === 0) errors.push(`${label}: requires が空です`);
      for (const [target, rangeStr] of requiresEntries) {
        if (target !== matrix.pivot) {
          errors.push(`${label}: requires対象 "${target}" は pivot("${matrix.pivot}")ではありません(v1は星型のみ対応)`);
          continue;
        }
        try {
          parseRange(rangeStr);
        } catch (e) {
          errors.push(`${label}: requires.${target} が不正です(${(e as Error).message})`);
        }
      }
    }
  }

  for (const [comp, rel] of Object.entries(matrix.releases)) {
    if (rel.type === "github-releases" && !rel.repo) errors.push(`releases.${comp}: type=github-releases には repo が必要です`);
    else if (rel.type === "helm-index" && (!rel.url || !rel.chart)) errors.push(`releases.${comp}: type=helm-index には url と chart が必要です`);
    else if (rel.type !== "github-releases" && rel.type !== "helm-index") errors.push(`releases.${comp}: 未対応の type です: ${rel.type}`);
  }

  const ok = errors.length === 0;
  if (values.json) {
    printJson({ ok, path: matrixPath, errors });
  } else if (ok) {
    console.log(`OK: ${matrixPath}`);
  } else {
    for (const e of errors) console.log(`NG  ${e}`);
  }
  if (!ok) process.exit(1);
}
