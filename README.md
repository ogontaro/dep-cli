# depctl

コンポーネント間のバージョン互換性(「このコンポーネントのこのバージョンは、相手コンポーネントのどの範囲のバージョンに対応するか」)を
`.depctl/matrix.yaml` に記録し、リポジトリの実ファイルから読んだ現在バージョン(State)と突き合わせて機械的に検証・提案する汎用CLIです。

典型的なユースケース: Renovate 等が個別に「新しいバージョンが出ています」と提案してくるが、コンポーネント同士が
静的な上下限のバージョン互換制約(例: CNIのバージョンによってサポートするKubernetesバージョンが決まっている)で
結びついていて、個別に上げると壊れる状況を、機械判定で解決する。

depctl本体は特定のコンポーネント名やエコシステムを一切知りません。何を・どこから・どう互換とみなすかは
すべて `.depctl/` 配下の2つのファイルで表現します。

## インストール

```sh
brew install ogontaro/tap/depctl
```

## 概念モデル

- **Component**: バージョンを持つ管理対象(例: kubernetes, cilium)
- **Pivot**: 全Componentの互換性がそこを基準に語られる1つのハブComponent(例: kubernetes)。
  v1は「各Component → pivot」の星型トポロジーのみをサポートする
- **Matrix**(`.depctl/matrix.yaml`): Component×Versionごとに「pivotの対応範囲」を記録した、環境非依存の互換性データ。
  手編集も可能だが、基本は `depctl matrix add` コマンドで組み立てる
- **Config**(`.depctl/config.yaml`): 利用側リポジトリ固有の設定。各Componentの現在バージョンをどのファイルの
  どの正規表現で読み取るか、を書く
- **State**: Configの`source`定義に従ってリポジトリの実ファイルから読み取った、現在の各Componentバージョン

`.depctl/` は `.git/` と同じように、実行時のカレントディレクトリから親方向へ探索して見つけます。

## クイックスタート

### 1. matrixをコマンドで組み立てる(matrix.yamlはまだ無くてよい)

```sh
depctl matrix add cilium 1.19 --requires kubernetes=1.32..1.35 --pivot kubernetes \
  --source "https://docs.cilium.io/en/v1.19/network/kubernetes/compatibility/" --retrieved 2026-09-03

depctl matrix add cilium 1.20 --requires kubernetes=1.33..1.36 \
  --source "https://docs.cilium.io/en/v1.20/network/kubernetes/compatibility/" --retrieved 2026-09-03
```

初回だけ `--pivot <component>` が必要です(`.depctl/matrix.yaml` が無ければこのタイミングで新規作成されます)。
2回目以降は不要です。

### 2. config.yamlで現在バージョンの読み取り方を書く

```yaml
# .depctl/config.yaml
version: 1
components:
  kubernetes:
    source:
      file: terraform/talos/variables.tf
      pattern: 'kubernetes_version"\s*\{[\s\S]*?default\s*=\s*"v(?<version>[0-9.]+)"'
  cilium:
    source:
      file: kubernetes/clusters/mycluster/cilium/helmfile.yaml
      pattern: 'chart:\s*cilium/cilium[\s\S]*?version:\s*(?<version>\S+)'
```

`pattern` は名前付きキャプチャ `(?<version>...)` を1つ含む正規表現です。

### 3. 検証・提案コマンドを使う

```sh
depctl status                       # 現在の各componentバージョンを表示
depctl check                        # 現在StateをMatrixで検証(未収録は違反として扱う)
depctl max kubernetes               # 他componentを現状に固定した場合のkubernetesの上限
depctl plan --set kubernetes=1.36   # 目標への、毎ホップMatrix妥当な順序付き経路
```

## コマンド一覧

| コマンド | 役割 |
|---|---|
| `depctl status` | 現在の各componentバージョンを表示する |
| `depctl check` | 現在のStateをmatrixで検証する。未収録は互換扱いにせず違反として報告する |
| `depctl max <component>` | 他componentを現在Stateに固定した場合の`<component>`の上限を表示する |
| `depctl plan --set <component>=<version\|max>` | 目標への、毎ホップmatrix妥当な順序付き経路を提示する。到達不可なら理由を返す |
| `depctl matrix show [component]` | matrixを閲覧する |
| `depctl matrix add <component> <version> --requires <pivot>=<min..max> [--source <url>] [--retrieved <date>] [--extra key=value] [--pivot <component>]` | matrixに行を追記する |
| `depctl matrix rm <component> <version>` | matrixから行を削除する |
| `depctl matrix validate` | matrixのスキーマ・整合性を検査する |
| `depctl matrix outdated` | `releases`に設定した各componentの最新リリースに対し、matrix未収録のマイナーバージョンを検知する |

全コマンド共通で `--json` を付けるとJSON出力になります(スクリプト連携・CI用)。
`check` / `matrix validate` / `matrix outdated` は違反や未収録があると終了コード非ゼロを返します。

## matrix.yaml スキーマ

```yaml
version: 1
pivot: kubernetes
releases:                    # `depctl matrix outdated` が最新リリースを調べに行く先(任意)
  cilium:
    type: helm-index         # または github-releases
    url: https://helm.cilium.io/index.yaml
    chart: cilium
components:
  cilium:
    "1.19":                  # マイナー粒度のキー
      requires:
        kubernetes: 1.32..1.35   # 閉区間(両端含む)
      source: https://docs.cilium.io/en/v1.19/network/kubernetes/compatibility/
      retrieved: 2026-09-03
      # appVersion のような任意の追加フィールドも --extra で保存できる
      # (helm chartバージョンと本体appVersionがズレるcomponent向け)
```

## 制約(v1スコープ)

- トポロジーはpivot1つの星型のみ。任意のComponentペア間の直接依存は扱わない
- バージョンはマイナー粒度(major.minor)でのみ比較する
- `.depctl/matrix.yaml` にドメインデータ(具体的なコンポーネント名や互換範囲)を1つも同梱しない。
  実データの投入は利用側リポジトリで `depctl matrix add` を使って行う

## 開発

bun自体を含め、開発に使うツールは [mise](https://mise.jdx.dev/) で用意する(`.mise.toml`でバージョン固定)。

```sh
mise install       # .mise.tomlのbunをインストール
mise run install   # bun install
mise run test      # bun test
mise run typecheck # tsc --noEmit
mise run build     # dist/depctl に単一バイナリを生成
```

## リリース

`vX.Y.Z` タグをpushすると `.github/workflows/release.yml` が3プラットフォーム分のバイナリを
GitHub Releaseに公開する。Homebrew tap(`ogontaro/homebrew-tap`)側のformula更新までの
詳しい手順は [`.claude/rules/release.md`](.claude/rules/release.md) を参照。
