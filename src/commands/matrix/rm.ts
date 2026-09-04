import { parseArgs } from "node:util";
import { removeEntry, resolveMatrix, saveMatrix } from "../../matrix.ts";

export function run(argv: string[]): void {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true });
  const [component, version] = positionals;
  if (!component || !version) throw new Error("使い方: depctl matrix rm <component> <version>");

  const { matrixPath, matrix } = resolveMatrix();
  const removed = removeEntry(matrix, component, version);
  if (!removed) throw new Error(`該当する行が見つかりません: ${component}@${version}`);
  saveMatrix(matrixPath, matrix);
  console.log(`削除しました: ${component}@${version}`);
}
