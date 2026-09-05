---
paths:
  - "skills/**"
  - ".claude-plugin/**"
---

# depctl pluginのバージョニングルール

`skills/`配下(SKILL.md等)や `.claude-plugin/plugin.json` 本体の内容を**コミットする**ときは、
そのコミットで `.claude-plugin/plugin.json` の `version` をセマンティックバージョニングで
インクリメントする(文言修正・descriptionの微調整はpatch、トリガー条件追加やskill追加等の
機能追加はminor、既存skillの削除・大幅な挙動変更はmajor)。

このバージョンは `package.json`(depctl CLI本体のバージョン、`.claude/rules/release.md`参照)とは
**別物**。plugin(skillの中身)がいつ変わったかを追うためのもので、CLIのリリースとは独立に上げる。

バージョンを上げるのは、コミットする直前・コミットに含めるタイミングで1回だけ。まだコミットしていない
作業中(下書き・試行錯誤・チューニングの反復編集など)に、編集のたびに先回りして上げない。

version のみを変更するコミット(他ファイルの変更を伴わない)は対象外。README.mdのみの変更
(skillの内容に関わらない変更)も対象外。
