---
paths:
  - "package.json"
---

# depctlのリリース手順

ユーザーから「リリースして」「バージョンを上げて」「公開して」等を頼まれたら、以下の手順で進める。

## バージョン番号の決め方(semver)

`.depctl/matrix.yaml` / `config.yaml` のスキーマ互換性で判断する。

| 変更内容 | bump |
|---|---|
| スキーマ非互換の変更(例: `requires`の形式変更、既存コマンドの削除・非互換な挙動変更) | major |
| 後方互換のコマンド・フラグ追加 | minor |
| バグ修正のみ、挙動変更なし | patch |

## 手順

1. `bun test` / `bun run typecheck` が通ることを確認する
2. `package.json` の `version` を上記のsemver方針で更新する(Editツールで直接書き換えてよい。専用スクリプトは無い)
3. git-usage skill経由でcommit・tag・push(Bashでのgit実行は禁止、git MCP経由)
   - commit: `chore: release vX.Y.Z`
   - tag: 同名 `vX.Y.Z`(annotated)
   - 両方pushする(tagのpushで`release.yml`が起動する)
4. `release.yml` の完了を待つ(`gh run watch`等で確認)。3プラットフォーム分のバイナリと`checksums.txt`がGitHub Releaseに添付される
5. `ogontaro/homebrew-tap` リポジトリの `Formula/depctl.rb` を更新する
   - `version` を新バージョンに
   - 3つの `sha256` を、4で生成された `checksums.txt`(またはダウンロードした各tar.gzの実測)から更新する。**Formula内の古い値を使い回さない**(バイナリはビルドのたびに内容が変わりチェックサムも変わるため、必ずその場で再取得・再計算する)
   - commit・push(こちらも git MCP経由)
6. `brew untap ogontaro/tap && brew tap ogontaro/tap && brew upgrade ogontaro/tap/depctl`(または新規`brew install`)で実際にインストールし、`depctl --version`が新バージョンを返すことを確認する

## 補足

- `release-drafter`(`.github/workflows/release-drafter.yml`)はPRベースの変更のみを集計するdraftを維持する。git-direct(mainへの直接push)はここに反映されないため、**公開されるReleaseの本文は`release.yml`側の`generate_release_notes: true`(全コミット対象)を正とする**。draftの内容とズレていても問題ない
- dep-cliはpublicリポジトリなので、Homebrew formulaは認証なしでprebuiltバイナリ(`url`+`sha256`)を取得できる。private化した場合はこの手順が使えなくなる(過去に試した「private repoのReleaseアセットを認証取得するHomebrew内部API依存のcustom download strategy」は非公式ハックで壊れやすいため非推奨)
