---
name: build-compat-matrix
description: Use when working with dep — a CLI that checks version compatibility across interdependent components (e.g. kubernetes/CNI/cert-manager-style addons) via a `.dep/matrix.yaml`. Trigger when a `.dep/` directory exists in the repository, when the user asks whether/how to upgrade one component given the others ("このバージョンまで上げても大丈夫か", "アップグレード経路を教えて", "上限を調べて"), or wants matrix.yaml populated with upstream compatibility data ("互換性データを調べてmatrixに登録して", "matrix.yamlを埋めて", "matrixに追加して").
---

# dep の使い方

`dep` はcomponent間のバージョン互換性を `.dep/matrix.yaml`(環境非依存の互換性データ)と
`.dep/config.yaml`(利用側リポジトリ固有の現在バージョン読み取り設定)を突き合わせて機械判定する
汎用CLI。詳細なコマンド一覧・スキーマは https://github.com/ogontaro/dep-cli の README、または
`dep --help` / `dep matrix --help` を参照(このskillでは重複させない)。

## 前提となるモデル

- 全Componentの互換性は1つの**pivot**(例: kubernetes)を基準に語られる星型トポロジーのみ(v1)
- Matrixに無い行(未収録)は互換扱いにせず、常に違反として扱う。「わからない」を「大丈夫」にしない
- `.dep/` は `.git/` と同様、cwdから親方向へ探索して見つかる

## 日常利用(既にmatrix.yamlがある場合)

`dep status` → `dep check` → 上げたいcomponentがあれば `dep max <component>` で上限、
`dep plan --set <component>=<version|max>` で毎ホップ妥当な移行手順を得る。到達不可なら
`reason`にその理由(どのcomponentが現在値と目標値を同時に満たせないか)が出る。

## matrix.yamlを構築・拡充する(データが無い/古い場合)

ユーザーから「〇〇の互換性を調べてmatrixに登録して」と頼まれたら、次の手順で進める。

1. **調査はsubagentに投げる**(メインの会話コンテキストを汚染しないため)。対象componentの
   ベンダー公式ドキュメント(サポートマトリクス、compatibilityページ、releasesページ等)から、
   「バージョン → 対応pivotバージョン範囲」を調べさせる。依頼時は次を明記する:
   - 出典URLと取得日を必ず添えて報告すること
   - 公式ドキュメントで確認できない場合は範囲を推測せず「未確認」と明示すること(不変条件
     「わからない」を「大丈夫」にしないため)
2. 上流が「supported」「tested」等複数種類の範囲を公開している場合は、**vendor公式の保証である
   「supported」側(狭い方)を採用する**。判定が安全側に倒れることはあっても緩い側には外れない
   ようにするため
3. 得られた範囲を `min..max` の閉区間形式(マイナー粒度、両端含む。例: `1.32..1.35`)に正規化する
4. `dep matrix add <component> <version> --requires <pivot>=<min..max> --source <出典URL> --retrieved <取得日>`
   で1バージョンずつ登録する(`--source`/`--retrieved`は監査可能性のため省略しない)。matrix.yaml
   がまだ無ければ最初の1回だけ `--pivot <component>` を付けて新規作成する
5. chart版とapp本体のバージョンがズレるcomponent(例: Helm chartとoperator本体)は、
   `--extra appVersion=<値>` のように任意フィールドとして記録する
6. 一通り追加したら `dep matrix validate` でスキーマ・整合性を確認する
7. 新しいバージョンが出ていないかは `dep matrix outdated` で検知できる
   (`.dep/matrix.yaml` の `releases:` に `github-releases`/`helm-index` を設定してある場合)
