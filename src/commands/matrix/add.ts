import { parseArgs } from "node:util";
import { resolveOrCreateMatrix, saveMatrix, setEntry, type MatrixEntry } from "../../matrix.ts";
import { parseRange } from "../../range.ts";

// matrix.yaml をゼロから組み立てられるようにするための中心コマンド。
// 例: depctl matrix add cilium 1.19 --requires kubernetes=1.32..1.35 --source https://... --retrieved 2026-09-03 --pivot kubernetes
export function run(argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      requires: { type: "string", multiple: true },
      source: { type: "string" },
      retrieved: { type: "string" },
      extra: { type: "string", multiple: true },
      pivot: { type: "string" },
    },
    allowPositionals: true,
  });
  const [component, version] = positionals;
  if (!component || !version) {
    throw new Error(
      "使い方: depctl matrix add <component> <version> --requires <target>=<min..max> [--source <url>] [--retrieved <date>] [--extra key=value] [--pivot <component>(新規作成時のみ)]",
    );
  }
  if (!values.requires || values.requires.length === 0) {
    throw new Error("--requires <target>=<min..max> を最低1つ指定してください");
  }

  const { matrixPath, matrix } = resolveOrCreateMatrix(values.pivot);

  if (values.pivot && values.pivot !== matrix.pivot) {
    throw new Error(`既存の matrix.yaml の pivot は "${matrix.pivot}" です(--pivot ${values.pivot} とは矛盾します)`);
  }

  const requires: Record<string, string> = {};
  for (const r of values.requires) {
    const eq = r.indexOf("=");
    if (eq < 0) throw new Error(`--requires は target=min..max の形式で指定してください: ${r}`);
    const target = r.slice(0, eq);
    const rangeStr = r.slice(eq + 1);
    if (target !== matrix.pivot) {
      throw new Error(
        `v1はpivot("${matrix.pivot}")宛のDependencyのみ対応しています。"${target}"宛は指定できません(星型トポロジー)`,
      );
    }
    parseRange(rangeStr); // バリデーションのみ。保存は元の文字列のまま。
    requires[target] = rangeStr;
  }

  const entry: MatrixEntry = { requires };
  if (values.source) entry.source = values.source;
  if (values.retrieved) entry.retrieved = values.retrieved;
  for (const e of values.extra ?? []) {
    const eq = e.indexOf("=");
    if (eq < 0) throw new Error(`--extra は key=value の形式で指定してください: ${e}`);
    entry[e.slice(0, eq)] = e.slice(eq + 1);
  }

  setEntry(matrix, component, version, entry);
  saveMatrix(matrixPath, matrix);
  console.log(`書き込みました: ${component}@${version} (${matrixPath})`);
}
