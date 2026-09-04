// "1.32..1.35" のような閉区間(マイナー単位、両端含む)の表現。
// 完全なsemver範囲構文(>=, ^, ~ 等)は今のドメイン(vendorが公開する「サポート範囲min〜max」)には
// 過剰なので採用せず、常に閉区間1種類だけを扱う。

import { compareMinor, toMinorKey } from "./version.ts";

export interface Range {
  min: string; // マイナーキー "1.32"
  max: string; // マイナーキー "1.35"
}

export function parseRange(input: string): Range {
  const parts = input.split("..");
  if (parts.length !== 2 || !parts[0]?.trim() || !parts[1]?.trim()) {
    throw new Error(`レンジは "min..max" 形式で指定してください(例: "1.32..1.35"): "${input}"`);
  }
  const min = toMinorKey(parts[0]);
  const max = toMinorKey(parts[1]);
  if (compareMinor(min, max) > 0) {
    throw new Error(`レンジのminがmaxを超えています: "${input}"`);
  }
  return { min, max };
}

export function formatRange(r: Range): string {
  return `${r.min}..${r.max}`;
}

export function rangeContains(range: Range, version: string): boolean {
  const v = toMinorKey(version);
  return compareMinor(v, range.min) >= 0 && compareMinor(v, range.max) <= 0;
}
