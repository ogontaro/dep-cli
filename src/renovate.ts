// renovate設定ファイル(json5想定)の allowedVersions を、コメントを壊さずテキスト置換で更新する。
// 対象箇所は `// dep:allowedVersions <component>` というマーカー行の直後(=そのpackageRuleオブジェクト内)。
// full parse + stringify するとコメントが飛ぶため、あえて構文解析はしない。

import { parseMinorVersion } from "./version.ts";

// `dep max` が返すマイナーキー("1.34")から、renovateの allowedVersions 式("<1.35")を作る。
// 「<次のマイナー」にすることで 1.34.x は全て許可、1.35.0 以降は禁止、というsemver的に正しい上限になる。
export function nextMinorBound(maxMinorKey: string): string {
  const v = parseMinorVersion(maxMinorKey);
  return `<${v.major}.${v.minor + 1}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// マーカー行の直後から、そのオブジェクトを閉じる `}` までの範囲(閉じ括弧は含まない)を返す。
// 文字列リテラルと // 行コメント内の波括弧は数えない。
function currentObjectBody(rest: string): string {
  let depth = 1; // マーカーは既に `{` の内側
  let i = 0;
  while (i < rest.length) {
    const ch = rest[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < rest.length && rest[i] !== quote) {
        if (rest[i] === "\\") i++;
        i++;
      }
    } else if (ch === "/" && rest[i + 1] === "/") {
      while (i < rest.length && rest[i] !== "\n") i++;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return rest.slice(0, i);
    }
    i++;
  }
  throw new Error("マーカーに対応するオブジェクトの閉じ括弧が見つかりません");
}

export interface SetResult {
  changed: boolean;
  before: string | null; // 置換前の allowedVersions 値。既存行が無ければ null
  text: string;
}

export function setAllowedVersions(content: string, component: string, desired: string): SetResult {
  const markerRe = new RegExp(`^([ \\t]*)//[ \\t]*dep:allowedVersions[ \\t]+${escapeRegExp(component)}[ \\t]*$`, "m");
  const m = markerRe.exec(content);
  if (!m) {
    throw new Error(`"// dep:allowedVersions ${component}" マーカーが renovate設定に見つかりません`);
  }
  const indent = m[1] ?? "";
  const markerEnd = m.index + m[0].length;
  const rest = content.slice(markerEnd);
  const body = currentObjectBody(rest);

  const avRe = /(\n[ \t]*"allowedVersions"[ \t]*:[ \t]*)("(?:[^"\\]|\\.)*")/;
  const avm = avRe.exec(body);
  if (avm?.[2]) {
    const before = avm[2].slice(1, -1);
    if (before === desired) return { changed: false, before, text: content };
    const newBody = body.replace(avRe, `$1"${desired}"`);
    return { changed: true, before, text: content.slice(0, markerEnd) + newBody + rest.slice(body.length) };
  }

  const insertion = `\n${indent}"allowedVersions": "${desired}",`;
  return { changed: true, before: null, text: content.slice(0, markerEnd) + insertion + rest };
}
