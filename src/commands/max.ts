import { parseArgs } from "node:util";
import { loadConfig } from "../config.ts";
import { readState } from "../state.ts";
import { loadMatrix } from "../matrix.ts";
import { computeMaxComponent, computeMaxPivot } from "../compat.ts";
import { printJson } from "../format.ts";
import { formatRange } from "../range.ts";

export function run(argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { json: { type: "boolean" } },
    allowPositionals: true,
  });
  const component = positionals[0];
  if (!component) throw new Error("使い方: depctl max <component>");

  const { root, config, matrixPath } = loadConfig();
  const state = readState(root, config);
  const matrix = loadMatrix(matrixPath);
  const result = component === matrix.pivot ? computeMaxPivot(matrix, state) : computeMaxComponent(matrix, state, component);

  if (values.json) {
    printJson(result);
    if (result.errors.length > 0) process.exit(1);
    return;
  }

  if (result.errors.length > 0) {
    for (const e of result.errors) console.log(`NG  ${e}`);
    process.exit(1);
  }
  console.log(`${component} の上限: ${result.value}`);
  const bottleneck = result.limitedBy.filter((b) => b.range.max === result.value);
  if (bottleneck.length > 0) {
    console.log(`律速: ${bottleneck.map((b) => `${b.component}(${formatRange(b.range)})`).join(", ")}`);
  }
}
