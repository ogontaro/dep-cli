# dep

複数のコンポーネントが「互いのバージョンで対応範囲が縛られている」状況を、機械的に扱うCLIです。

たとえば Kubernetes とその addon(CNI・cert-manager 等)。addon のバージョンごとに対応する
Kubernetes の範囲が決まっていて、個別に上げると壊れます。`dep` は各コンポーネントの対応範囲を
1つの表(`.dep/matrix.yaml`)に持ち、いま何をどこまで上げてよいかを答えます。

**表は AI に作らせる前提です。** 上流ドキュメント(サポートマトリクス等)を調べて表に落とす作業は、
同梱の Claude Code プラグイン(`build-compat-matrix` skill)が担当します。人間が書くのは
「現在バージョンの読み取り方」だけです。

```
$ dep max kubernetes
kubernetes の上限: 1.34
律速: keda(1.32..1.34)

$ dep plan --set kubernetes=1.36
到達不可: keda: 現在の 1.34 と目標 1.36 を同時に満たす既知バージョンがありません
```

## インストール

```sh
brew install ogontaro/tap/dep
```

## 使い方

`dep` は cwd から親方向へ `.dep/` を探します(`.git/` と同じ)。中に2つのファイルを置きます。

### 1. `.dep/config.yaml` を書く(人間、数行)

各コンポーネントの「現在バージョンをどのファイルのどの正規表現で読むか」を書きます。

```yaml
version: 1
components:
  kubernetes:
    source:
      file: terraform/talos/variables.tf
      pattern: 'kubernetes_version"[\s\S]*?default\s*=\s*"v(?<version>[0-9.]+)"'
    renovate:                       # renovate 連携する場合だけ(後述)
      file: renovate.json5
  cilium:
    source:
      file: kubernetes/clusters/mycluster/cilium/helmfile.yaml
      pattern: 'chart:\s*cilium/cilium[\s\S]*?version:\s*(?<version>\S+)'
```

`pattern` は名前付きキャプチャ `(?<version>...)` を1つ含む正規表現です。

### 2. `.dep/matrix.yaml` を AI に作らせる

`.dep/` のあるリポジトリで Claude Code に頼みます。

> cilium と kubernetes の互換性を調べて matrix に入れて

`build-compat-matrix` skill が上流の公式ドキュメントを調べ、`dep matrix add` を実行して
`.dep/matrix.yaml` を組み立てます(出典 URL と取得日も記録されます)。手で書くこともできますが、
基本は AI 任せです。

### 3. 日々のコマンド

```sh
dep status                       # 現在の各コンポーネントのバージョン
dep check                        # 現状が matrix と矛盾しないか(未収録は違反扱い)
dep max kubernetes               # いま kubernetes をどこまで上げてよいか(律速も表示)
dep plan --set kubernetes=1.36   # そこへ至る手順、または到達不可の理由
dep matrix outdated              # 上流に新しいバージョンが出て matrix が古くなっていないか
dep renovate sync                # 上限を renovate.json5 の allowedVersions に書き戻す
```

## コマンド一覧

| コマンド | 役割 |
|---|---|
| `dep status` | 現在の各コンポーネントのバージョンを表示 |
| `dep check` | 現状を matrix で検証(未収録は違反、終了コード非ゼロ) |
| `dep max <component>` | 他を現状に固定したときの `<component>` の上限 |
| `dep plan --set <component>=<version\|max>` | 目標への順序付き手順。到達不可なら理由 |
| `dep matrix show [component]` | matrix を表示 |
| `dep matrix add <component> <version> --requires <pivot>=<min..max> [--source] [--retrieved] [--extra k=v] [--pivot]` | matrix に行を追加(主に AI が実行) |
| `dep matrix rm <component> <version>` | matrix から行を削除 |
| `dep matrix validate` | matrix のスキーマ・整合性を検査 |
| `dep matrix outdated` | 上流の最新に対し matrix 未収録のマイナーを検知(終了コード非ゼロ) |
| `dep renovate sync [--dry-run]` | `max` の結果を renovate の `allowedVersions` に反映(差分あり `--dry-run` は非ゼロ) |

すべて `--json` を付けると JSON 出力になります。

## `.dep/matrix.yaml` の中身

AI が生成しますが、読み方・手直しのために構造を載せておきます。

```yaml
version: 1
pivot: kubernetes                # 互換範囲の基準にする1コンポーネント
releases:                        # matrix outdated が最新を調べに行く先(任意)
  cilium: { type: helm-index, url: https://helm.cilium.io/index.yaml, chart: cilium }
  talos:  { type: github-releases, repo: siderolabs/talos }
components:
  cilium:
    "1.19":                                    # マイナー粒度
      requires: { kubernetes: 1.32..1.35 }     # このバージョンが対応する pivot の範囲(両端含む)
      source: https://docs.cilium.io/en/v1.19/network/kubernetes/compatibility/
      retrieved: 2026-09-06
```

- **pivot**: すべての互換範囲は pivot(例 kubernetes)を軸に表現します。pivot を介さない
  コンポーネント同士の直接依存は扱いません(v1)。
- **未収録は互換とみなしません。** matrix に行が無ければ `check` / `max` は違反・エラーにします。
- 上流が「supported」と「tested」を別々に出している場合は、狭いほう(supported)を採ります。

## renovate 連携

`config.yaml` で `renovate: { file: ... }` を設定したコンポーネントは、`dep renovate sync` で
`max` の結果を renovate 設定の `allowedVersions` に書き戻せます(例: 上限 1.35 → `"<1.36"`)。

対象の packageRule の先頭にマーカーコメントを1行足しておきます。`dep` はこのオブジェクト内の
`allowedVersions` だけをテキスト置換するので、コメントや他の設定は保持されます。

```json5
"packageRules": [
  {
    // dep:allowedVersions kubernetes
    "matchPackageNames": ["kubernetes/kubernetes"],
    "allowedVersions": "<1.34"
  }
]
```

## Claude Code プラグイン

このリポジトリ自体が Claude Code プラグインです。インストールすると `build-compat-matrix` skill が
有効になり、`dep` のコマンド操作と matrix 構築(上流調査 → `dep matrix add`)を Claude が代行します。

```sh
git clone https://github.com/ogontaro/dep-cli.git
claude --plugin-dir ./dep-cli
```

`~/.claude/skills/dep/` に置くと次回セッションから自動で有効になります。

## ライセンス

MIT
