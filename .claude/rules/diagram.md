---
paths:
  - "docs/**/*.d2"
---

# 図の再生成ルール

`docs/` 配下の `.d2` を変更してコミットするときは、そのコミットで `mise run diagram` を実行し、
生成された `.svg`(`docs/concepts.svg` 等)を同じコミットに含める。`.d2` が正、`.svg` は生成物。

CI(`ci.yml`)が `mise run diagram` 後の `git diff` でドリフトを検出して落とすので、
再生成を忘れると PR / push が赤くなる。
