import { parseArgs } from "node:util";
import { resolveMatrix } from "../../matrix.ts";
import { printJson, printTable } from "../../format.ts";

export function run(argv: string[]): void {
  const { values, positionals } = parseArgs({ args: argv, options: { json: { type: "boolean" } }, allowPositionals: true });
  const filter = positionals[0];
  const { matrix } = resolveMatrix();

  if (values.json) {
    printJson(filter ? { pivot: matrix.pivot, [filter]: matrix.components[filter] ?? {} } : matrix);
    return;
  }

  const rows: string[][] = [];
  for (const [comp, versions] of Object.entries(matrix.components)) {
    if (filter && comp !== filter) continue;
    for (const [v, entry] of Object.entries(versions)) {
      const requires = Object.entries(entry.requires)
        .map(([k, r]) => `${k}:${r}`)
        .join(", ");
      rows.push([comp, v, requires, entry.source ?? "", entry.retrieved ?? ""]);
    }
  }
  console.log(`pivot: ${matrix.pivot}`);
  printTable(["component", "version", "requires", "source", "retrieved"], rows);
}
