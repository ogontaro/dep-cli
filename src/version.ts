// バージョン文字列(例: "v1.35.6", "1.19.3", "1.21")をマイナー単位で正規化・比較するための最小限のユーティリティ。
// Matrixはマイナー粒度でしかバージョンを記録しないため、比較は常にmajor.minorに丸めて行う。

export interface MinorVersion {
  major: number;
  minor: number;
}

const VERSION_RE = /^v?(\d+)\.(\d+)(?:\.\d+.*)?$/;

export function parseMinorVersion(input: string): MinorVersion {
  const m = VERSION_RE.exec(input.trim());
  if (!m || !m[1] || !m[2]) {
    throw new Error(`バージョン文字列を解釈できません: "${input}"(例: "v1.35.6" / "1.19" のような形式である必要があります)`);
  }
  return { major: Number(m[1]), minor: Number(m[2]) };
}

// "v1.35.6" -> "1.35" のように、比較・Matrixキーに使う正規形へ変換する。
export function toMinorKey(input: string): string {
  const v = parseMinorVersion(input);
  return `${v.major}.${v.minor}`;
}

export function compareMinor(a: string, b: string): number {
  const va = parseMinorVersion(a);
  const vb = parseMinorVersion(b);
  if (va.major !== vb.major) return va.major - vb.major;
  return va.minor - vb.minor;
}

// "1.21.0-pre.0" / "v1.21.0-rc1" のようにバージョンコアの後ろにprerelease識別子が付くか。
export function isPrerelease(input: string): boolean {
  return /^v?\d+\.\d+(?:\.\d+)?-/.test(input.trim());
}
