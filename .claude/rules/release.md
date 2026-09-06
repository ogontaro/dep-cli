---
paths:
  - "**"
---

# depのコミット/リリース運用

dep-cliへの変更をcommit・pushしたら、ユーザーから改めて「リリースして」と言われるのを
待たず、**そのつど続けてリリースまで行う**(release-drafterは使わない。廃止済み)。

対象外(リリース不要、通常のcommitのみでよい): `src/`を含まない変更
(README.md、`.github/`、`.claude/`等のみ)。ビルドされるバイナリの挙動が
変わらないコミットにリリースを紐付けても意味が無いため。
`package.json`のversionのみの変更(リリース手順そのもの)も対象外。

## バージョン番号の決め方(semver)

`.dep/matrix.yaml` / `config.yaml` のスキーマ互換性で判断する。

| 変更内容 | bump |
|---|---|
| スキーマ非互換の変更(例: `requires`の形式変更、既存コマンドの削除・非互換な挙動変更) | major |
| 後方互換のコマンド・フラグ追加 | minor |
| バグ修正のみ、挙動変更なし | patch |

## 手順

1. 通常通りgit-direct skill経由でcommit・push(Bashでのgit実行は禁止、git MCP経由)
2. 続けて `package.json` の `version` を上記semver方針でbumpし、`chore: release vX.Y.Z` として
   commit・push(Editツールで直接書き換えてよい。専用スクリプトは無い)
3. 同名 `vX.Y.Z` のtagを作成しpush(annotated。tagのpushで`release.yml`が起動する)
4. `release.yml` の完了を待つ(`gh run watch`等)。3プラットフォーム分のバイナリと
   `checksums.txt`がGitHub Releaseに添付される
5. `ogontaro/homebrew-tap` リポジトリの `Formula/dep.rb` を更新する
   - `version` を新バージョンに
   - 3つの `sha256` を、4で生成された `checksums.txt` から取得した値に更新する。
     **Formula内の古い値を使い回さない**(バイナリはビルドのたびに内容が変わり
     チェックサムも変わるため、必ずその場で再取得・再計算する)
   - commit・push(こちらも git MCP経由)
6. `brew untap ogontaro/tap && brew tap ogontaro/tap && brew upgrade ogontaro/tap/dep`
   (または新規`brew install`)で実際にインストールし、`dep --version`が新バージョンを
   返すことを確認する

## 補足

- dep-cliはpublicリポジトリなので、Homebrew formulaは認証なしでprebuiltバイナリ
  (`url`+`sha256`)を取得できる。private化した場合はこの手順が使えなくなる(過去に
  試した「private repoのReleaseアセットを認証取得するHomebrew内部API依存のcustom
  download strategy」は非公式ハックで壊れやすいため非推奨)
- 公開されるReleaseの本文は `release.yml` 側の `generate_release_notes: true`
  (直前タグからの全コミット対象)で自動生成する
