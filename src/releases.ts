// config.yaml の releases 定義に従って、componentの最新リリースを外部から取得する(`matrix outdated` 用)。
// ネットワークアクセスを伴うため、テスト時は fetchImpl を差し替えられるようにしている。

import { parse as parseYaml } from "yaml";
import type { ReleasesConfig } from "./matrix.ts";
import { isPrerelease, parseMinorVersion } from "./version.ts";

export interface LatestRelease {
  minorKey: string; // "1.20"
  version: string; // 具体的なタグ/バージョン文字列(例: "v1.20.1")
  appVersion?: string; // helm-indexのみ: chartが指すapp本体のバージョン(chart版とappVersionがズレるcomponent用)
}

interface GithubRelease {
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
}

interface HelmIndexEntry {
  version: string;
  appVersion?: string;
}

interface HelmIndex {
  entries?: Record<string, HelmIndexEntry[]>;
}

export async function fetchLatestRelease(cfg: ReleasesConfig, fetchImpl: typeof fetch = fetch): Promise<LatestRelease> {
  if (cfg.type === "github-releases") return fetchLatestGithubRelease(cfg, fetchImpl);
  if (cfg.type === "helm-index") return fetchLatestHelmRelease(cfg, fetchImpl);
  throw new Error(`未対応の releases.type です: ${(cfg as { type: string }).type}`);
}

async function fetchLatestGithubRelease(cfg: ReleasesConfig, fetchImpl: typeof fetch): Promise<LatestRelease> {
  if (!cfg.repo) throw new Error("releases.type=github-releases には repo が必要です");
  const res = await fetchImpl(`https://api.github.com/repos/${cfg.repo}/releases?per_page=100`, {
    headers: { "User-Agent": "depctl", Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub Releases取得に失敗しました(HTTP ${res.status}): ${cfg.repo}`);
  const releases = (await res.json()) as GithubRelease[];
  let best: { tag: string; major: number; minor: number } | undefined;
  for (const r of releases) {
    if (r.prerelease || r.draft || isPrerelease(r.tag_name)) continue;
    let mv;
    try {
      mv = parseMinorVersion(r.tag_name);
    } catch {
      continue;
    }
    if (!best || mv.major > best.major || (mv.major === best.major && mv.minor > best.minor)) {
      best = { tag: r.tag_name, major: mv.major, minor: mv.minor };
    }
  }
  if (!best) throw new Error(`${cfg.repo}: 有効な正式リリースタグが見つかりませんでした`);
  return { minorKey: `${best.major}.${best.minor}`, version: best.tag };
}

async function fetchLatestHelmRelease(cfg: ReleasesConfig, fetchImpl: typeof fetch): Promise<LatestRelease> {
  if (!cfg.url || !cfg.chart) throw new Error("releases.type=helm-index には url と chart が必要です");
  const res = await fetchImpl(cfg.url);
  if (!res.ok) throw new Error(`Helm index取得に失敗しました(HTTP ${res.status}): ${cfg.url}`);
  const index = parseYaml(await res.text()) as HelmIndex;
  const entries = index.entries?.[cfg.chart];
  if (!entries || entries.length === 0) {
    throw new Error(`${cfg.url}: chart "${cfg.chart}" が見つかりませんでした`);
  }
  let best: { version: string; appVersion: string | undefined; major: number; minor: number } | undefined;
  for (const e of entries) {
    if (isPrerelease(e.version)) continue;
    let mv;
    try {
      mv = parseMinorVersion(e.version);
    } catch {
      continue;
    }
    if (!best || mv.major > best.major || (mv.major === best.major && mv.minor > best.minor)) {
      best = { version: e.version, appVersion: e.appVersion, major: mv.major, minor: mv.minor };
    }
  }
  if (!best) throw new Error(`${cfg.url}: chart "${cfg.chart}" の有効なバージョンが見つかりませんでした`);
  return { minorKey: `${best.major}.${best.minor}`, version: best.version, appVersion: best.appVersion };
}
