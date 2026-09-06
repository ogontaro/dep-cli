#!/usr/bin/env bun
// dep: コンポーネント間のバージョン互換性(誰が誰の対応範囲を要求するか)を .dep/matrix.yaml に人間/AIが
// 記録し、リポジトリの実ファイルから読んだ現在バージョン(State)と突き合わせて機械判定する汎用CLI。

import * as statusCmd from "./commands/status.ts";
import * as checkCmd from "./commands/check.ts";
import * as maxCmd from "./commands/max.ts";
import * as planCmd from "./commands/plan.ts";
import * as matrixCmd from "./commands/matrix/index.ts";
import pkg from "../package.json" with { type: "json" };

const VERSION = pkg.version;

const HELP = `dep ${VERSION} - component間のバージョン互換性を .dep/matrix.yaml で機械的に検証するCLI

使い方:
  dep status                                  現在の各componentバージョンを表示する
  dep check                                   現在のStateをmatrixで検証する
  dep max <component>                         他componentを現在Stateに固定した場合の上限を表示する
  dep plan --set <component>=<version|max>    目標への順序付き経路を提示する
  dep matrix show [component]                 matrixを閲覧する
  dep matrix add <component> <version> ...    matrixに行を追記する(初回は --pivot が必要)
  dep matrix rm <component> <version>         matrixから行を削除する
  dep matrix validate                         matrixのスキーマ・整合性を検査する
  dep matrix outdated                         最新リリースに対しmatrix未収録の行を検知する

全コマンド共通で --json を付けるとJSON出力になります。
設定は cwd から親方向へ探索した .dep/config.yaml (State読み取り設定) と .dep/matrix.yaml (互換データ) を使います。`;

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;

  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(HELP);
    return;
  }
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }

  switch (cmd) {
    case "status":
      return statusCmd.run(rest);
    case "check":
      return checkCmd.run(rest);
    case "max":
      return maxCmd.run(rest);
    case "plan":
      return planCmd.run(rest);
    case "matrix":
      return await matrixCmd.run(rest);
    default:
      throw new Error(`不明なコマンドです: ${cmd}("dep --help" を参照)`);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`error: ${message}`);
  process.exit(1);
});
