// config.yamlのsource定義(ファイル+正規表現)に従って、各componentの「現在バージョン」をリポジトリの実ファイルから読み取る。

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DepConfig } from "./config.ts";

export type State = Record<string, string>; // component -> 読み取った生のバージョン文字列

export function readState(root: string, config: DepConfig): State {
  const state: State = {};
  for (const [name, cfg] of Object.entries(config.components)) {
    const filePath = join(root, cfg.source.file);
    let content: string;
    try {
      content = readFileSync(filePath, "utf8");
    } catch {
      throw new Error(`${name}: ソースファイルを読み込めません: ${filePath}`);
    }
    let re: RegExp;
    try {
      re = new RegExp(cfg.source.pattern);
    } catch (e) {
      throw new Error(`${name}: source.pattern が不正な正規表現です: ${cfg.source.pattern}(${(e as Error).message})`);
    }
    const m = re.exec(content);
    if (!m || !m.groups?.version) {
      throw new Error(
        `${name}: パターンが ${cfg.source.file} にマッチしませんでした` +
          `(名前付きキャプチャ (?<version>...) を含む正規表現である必要があります)`,
      );
    }
    state[name] = m.groups.version;
  }
  return state;
}
