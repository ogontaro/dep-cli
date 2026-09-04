import { parseArgs } from "node:util";
import { loadConfig } from "../config.ts";
import { readState } from "../state.ts";
import { printJson, printTable } from "../format.ts";

export function run(argv: string[]): void {
  const { values } = parseArgs({ args: argv, options: { json: { type: "boolean" } } });
  const { root, config } = loadConfig();
  const state = readState(root, config);

  if (values.json) {
    printJson(state);
    return;
  }
  printTable(
    ["component", "version"],
    Object.entries(state).map(([k, v]) => [k, v]),
  );
}
