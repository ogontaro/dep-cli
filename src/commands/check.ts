import { parseArgs } from "node:util";
import { loadConfig } from "../config.ts";
import { readState } from "../state.ts";
import { loadMatrix } from "../matrix.ts";
import { checkState } from "../compat.ts";
import { printJson } from "../format.ts";
import { formatRange } from "../range.ts";

// 終了コード: 違反(範囲外)・未収録のどちらでも非ゼロ(将来CIゲート化できるように)。
export function run(argv: string[]): void {
  const { values } = parseArgs({ args: argv, options: { json: { type: "boolean" } } });
  const { root, config, matrixPath } = loadConfig();
  const state = readState(root, config);
  const matrix = loadMatrix(matrixPath);
  const result = checkState(matrix, state);

  if (values.json) {
    printJson(result);
  } else {
    console.log(`pivot: ${result.pivot} = ${result.pivotVersion}`);
    if (result.ok) {
      console.log("OK: 全component が現在の pivot バージョンに対応しています");
    } else {
      for (const v of result.violations) {
        if (v.reason === "unrecorded") {
          console.log(`NG  ${v.component}@${v.version}: matrix 未収録`);
        } else {
          console.log(
            `NG  ${v.component}@${v.version}: 対応範囲 ${formatRange(v.range!)} に ${result.pivot} ${result.pivotVersion} が含まれません`,
          );
        }
      }
    }
  }
  if (!result.ok) process.exit(1);
}
