// .depctl/config.yaml の探索・読み込み。
// config.yamlは利用側リポジトリごとに手書きする少量の環境設定(現在バージョンの読み取り元、最新リリース取得元)。
// matrix.yaml(環境非依存の互換性データ)とは役割を分けている。

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";

export interface SourceConfig {
  file: string; // .depctlの親ディレクトリ(リポジトリルート)からの相対パス
  pattern: string; // 名前付きキャプチャ (?<version>...) を含む正規表現
}

export interface ComponentConfig {
  source: SourceConfig;
}

export interface DepctlConfig {
  version: 1;
  components: Record<string, ComponentConfig>;
}

export interface DiscoveredConfig {
  root: string; // .depctl/ の親ディレクトリ(リポジトリルート)
  depctlDir: string;
  configPath: string;
  matrixPath: string;
  config: DepctlConfig;
}

// gitの.gitディレクトリ探索と同じ方式: cwdから親方向へ .depctl を探す。
export function findDepctlDir(startDir: string): string {
  let dir = startDir;
  while (true) {
    const candidate = join(dir, ".depctl");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `.depctl ディレクトリが見つかりません("${startDir}" から親方向へ探索しました)。` +
          `リポジトリ直下に .depctl/config.yaml と .depctl/matrix.yaml を用意してください`,
      );
    }
    dir = parent;
  }
}

export function loadConfig(startDir: string = process.cwd()): DiscoveredConfig {
  const depctlDir = findDepctlDir(startDir);
  const root = dirname(depctlDir);
  const configPath = join(depctlDir, "config.yaml");
  const matrixPath = join(depctlDir, "matrix.yaml");
  if (!existsSync(configPath)) {
    throw new Error(`config.yaml が見つかりません: ${configPath}`);
  }
  const raw = parseYaml(readFileSync(configPath, "utf8")) as Partial<DepctlConfig> | null;
  if (!raw || raw.version !== 1 || typeof raw.components !== "object") {
    throw new Error(`config.yaml のスキーマが不正です(version: 1, components: {...} が必要): ${configPath}`);
  }
  return { root, depctlDir, configPath, matrixPath, config: { version: 1, components: raw.components ?? {} } };
}
