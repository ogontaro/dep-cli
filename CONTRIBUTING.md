# CONTRIBUTING

## 開発環境

bun を含む開発ツールは [mise](https://mise.jdx.dev/) で用意する(`.mise.toml` でバージョン固定)。

```sh
mise install       # .mise.toml の bun をインストール
mise run install   # bun install
mise run test      # bun test
mise run typecheck # tsc --noEmit
mise run build     # dist/dep に単一バイナリを生成
mise run diagram   # docs/concepts.d2 → docs/concepts.svg を再生成
```

## リポジトリ構成

| パス | 役割 |
|---|---|
| `src/` | CLI 実装(TypeScript / Bun) |
| `src/commands/` | 各サブコマンド |
| `src/compat.ts` | check / max / plan の中核ロジック |
| `src/releases.ts` | `matrix outdated` 用の最新リリース取得(github-releases / helm-index) |
| `src/renovate.ts` | `renovate sync` 用の allowedVersions テキスト置換(json5コメントを壊さない) |
| `test/` | `bun test`(unit + CLI サブプロセスの E2E) |
| `skills/build-compat-matrix/` | Claude Code プラグインの skill |
| `.claude-plugin/plugin.json` | プラグインマニフェスト |
| `.claude/rules/` | このリポジトリで作業する Claude 向けの条件付きルール |

## CI

- `.github/workflows/ci.yml` — push / PR で typecheck + test(mise 経由で `.mise.toml` の bun を使用)
- `.github/workflows/release.yml` — `v*` タグ push で3プラットフォーム(darwin-arm64 / darwin-amd64 /
  linux-amd64)のバイナリをビルドし、GitHub Release に `checksums.txt` 付きで添付する

## リリース

`src/` を含む変更をコミットしたら、続けてリリースまで行う運用。手順の正本は
[`.claude/rules/release.md`](.claude/rules/release.md)。概略:

1. `package.json` の `version` を semver で bump し `chore: release vX.Y.Z` としてコミット・push
2. 同名 `vX.Y.Z` タグを push(`release.yml` が起動する)
3. `release.yml` 完了後、`ogontaro/homebrew-tap` の `Formula/dep.rb` の `version` と3つの
   `sha256`(Release の `checksums.txt` から取得。古い値を使い回さない)を更新して push
4. `brew upgrade ogontaro/tap/dep` で `dep --version` が新バージョンを返すことを確認

- semver は `.dep/matrix.yaml` / `config.yaml` のスキーマ互換性で判断する
  (スキーマ非互換・コマンド削除 = major、後方互換のコマンド/フラグ追加 = minor、バグ修正のみ = patch)
- `dep --version` は `package.json` の `version` を読む(二重管理しない)
- README.md のみ / CI・ルールのみ など `src/` を含まない変更はリリース不要

## プラグインのバージョニング

`skills/` や `.claude-plugin/` の内容を変更してコミットしたら、`.claude-plugin/plugin.json` の
`version` も同じコミットで上げる。これは `package.json`(CLI 本体)とは**別番号**。詳細は
[`.claude/rules/plugin-versioning.md`](.claude/rules/plugin-versioning.md)。
