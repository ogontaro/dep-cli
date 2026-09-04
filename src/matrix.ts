// .depctl/matrix.yaml の読み書き。
// このファイルは環境非依存の互換性データそのもので、`depctl matrix add` 等のコマンドで組み立てる想定。
// 手編集も可能だが、保存時は常にcomponent/version順にソートして書き出し、出力を決定的にする。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { compareMinor, toMinorKey } from "./version.ts";
import { parseRange, type Range } from "./range.ts";
import { findDepctlDir } from "./config.ts";

export interface MatrixEntry {
  requires: Record<string, string>; // 対象component(基本はpivot) -> "min..max"
  source?: string;
  retrieved?: string;
  [extra: string]: unknown; // appVersion 等、componentごとに異なる補足情報を許容する
}

// `matrix outdated` が最新リリースを調べに行く先。source(現在値の読み取り方)と違い環境非依存なのでmatrix側に置く。
export interface ReleasesConfig {
  type: "github-releases" | "helm-index";
  repo?: string; // github-releases用: "owner/repo"
  url?: string; // helm-index用: index.yamlのURL
  chart?: string; // helm-index用: entries内のチャート名
}

export interface Matrix {
  version: 1;
  pivot: string;
  releases: Record<string, ReleasesConfig>;
  components: Record<string, Record<string, MatrixEntry>>;
}

export function emptyMatrix(pivot: string): Matrix {
  return { version: 1, pivot, releases: {}, components: {} };
}

export function loadMatrix(path: string): Matrix {
  if (!existsSync(path)) {
    throw new Error(
      `matrixファイルが見つかりません: ${path}\n"depctl matrix add" で新規作成するか、既存の matrix.yaml を配置してください`,
    );
  }
  const raw = parseYaml(readFileSync(path, "utf8")) as Partial<Matrix> | null;
  if (!raw || raw.version !== 1 || typeof raw.pivot !== "string") {
    throw new Error(`matrixファイルのスキーマが不正です(version: 1, pivot: <string> が必要): ${path}`);
  }
  return { version: 1, pivot: raw.pivot, releases: raw.releases ?? {}, components: raw.components ?? {} };
}

export function saveMatrix(path: string, matrix: Matrix): void {
  const sorted: Matrix = { version: 1, pivot: matrix.pivot, releases: matrix.releases, components: {} };
  for (const comp of Object.keys(matrix.components).sort()) {
    const versions = matrix.components[comp] ?? {};
    const sortedEntries: Record<string, MatrixEntry> = {};
    for (const v of Object.keys(versions).sort(compareMinor)) {
      const entry = versions[v];
      if (entry) sortedEntries[v] = entry;
    }
    sorted.components[comp] = sortedEntries;
  }
  writeFileSync(path, stringifyYaml(sorted), "utf8");
}

// component@version が target(基本はpivot)に対して持つレンジ。無ければundefined(=未収録)。
export function getRange(matrix: Matrix, component: string, version: string, target: string): Range | undefined {
  const key = toMinorKey(version);
  const entry = matrix.components[component]?.[key];
  const raw = entry?.requires?.[target];
  return raw ? parseRange(raw) : undefined;
}

export function setEntry(matrix: Matrix, component: string, version: string, entry: MatrixEntry): void {
  const key = toMinorKey(version);
  matrix.components[component] ??= {};
  matrix.components[component]![key] = entry;
}

export function removeEntry(matrix: Matrix, component: string, version: string): boolean {
  const key = toMinorKey(version);
  const versions = matrix.components[component];
  if (!versions || !(key in versions)) return false;
  delete versions[key];
  return true;
}

// 既存の .depctl/matrix.yaml を(config.yamlの有無に関わらず)探して読み込む。matrix系サブコマンド用。
export function resolveMatrix(startDir: string = process.cwd()): { matrixPath: string; matrix: Matrix } {
  const depctlDir = findDepctlDir(startDir);
  const matrixPath = join(depctlDir, "matrix.yaml");
  return { matrixPath, matrix: loadMatrix(matrixPath) };
}

// matrix.yamlが無ければ、cwd直下に .depctl/ を新規作成して空のmatrixを返す(コマンドだけでゼロから組み立てるため)。
export function resolveOrCreateMatrix(pivotForNew: string | undefined, startDir: string = process.cwd()): { matrixPath: string; matrix: Matrix } {
  let depctlDir: string;
  try {
    depctlDir = findDepctlDir(startDir);
  } catch {
    depctlDir = join(startDir, ".depctl");
  }
  const matrixPath = join(depctlDir, "matrix.yaml");
  if (existsSync(matrixPath)) {
    return { matrixPath, matrix: loadMatrix(matrixPath) };
  }
  if (!pivotForNew) {
    throw new Error(
      `matrix.yaml がまだありません(${matrixPath})。新規作成する場合は最初の "matrix add" に --pivot <component> を付けてください`,
    );
  }
  mkdirSync(depctlDir, { recursive: true });
  return { matrixPath, matrix: emptyMatrix(pivotForNew) };
}
