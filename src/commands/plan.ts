import { parseArgs } from "node:util";
import { loadConfig } from "../config.ts";
import { readState } from "../state.ts";
import { loadMatrix } from "../matrix.ts";
import { computeMaxComponent, computeMaxPivot, computePlan } from "../compat.ts";
import { printJson } from "../format.ts";

export function run(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: { json: { type: "boolean" }, set: { type: "string" } },
  });
  if (!values.set) throw new Error("使い方: dep plan --set <component>=<version|max>");
  const eq = values.set.indexOf("=");
  if (eq < 0) throw new Error(`--set は component=version の形式で指定してください: ${values.set}`);
  const component = values.set.slice(0, eq);
  let target = values.set.slice(eq + 1);
  if (!component || !target) throw new Error(`--set は component=version の形式で指定してください: ${values.set}`);

  const { root, config, matrixPath } = loadConfig();
  const state = readState(root, config);
  const matrix = loadMatrix(matrixPath);

  if (target === "max") {
    const maxResult = component === matrix.pivot ? computeMaxPivot(matrix, state) : computeMaxComponent(matrix, state, component);
    if (maxResult.errors.length > 0 || maxResult.value === undefined) {
      for (const e of maxResult.errors) console.log(`NG  ${e}`);
      process.exit(1);
    }
    target = maxResult.value;
  }

  const result = computePlan(matrix, state, component, target);

  if (values.json) {
    printJson(result);
    if (!result.ok) process.exit(1);
    return;
  }

  if (!result.ok) {
    console.log(`到達不可: ${result.reason}`);
    process.exit(1);
  }
  console.log(`Plan (${result.steps.length} step${result.steps.length === 1 ? "" : "s"}):`);
  result.steps.forEach((s, i) => console.log(`  ${i + 1}. ${s.component}: ${s.from} -> ${s.to}`));
}
