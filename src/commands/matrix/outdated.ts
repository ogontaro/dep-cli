import { parseArgs } from "node:util";
import { resolveMatrix } from "../../matrix.ts";
import { fetchLatestRelease } from "../../releases.ts";
import { printJson } from "../../format.ts";

interface OutdatedResult {
  component: string;
  latest?: string;
  latestMinor?: string;
  recorded: boolean;
  appVersion?: string;
  error?: string;
}

// component の最新リリースを取得し、そのマイナーバージョンが matrix に未収録なら報告する。
export async function run(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { json: { type: "boolean" } } });
  const { matrix } = resolveMatrix();

  const results: OutdatedResult[] = [];
  for (const [component, releasesCfg] of Object.entries(matrix.releases)) {
    try {
      const latest = await fetchLatestRelease(releasesCfg);
      const recorded = latest.minorKey in (matrix.components[component] ?? {});
      results.push({ component, latest: latest.version, latestMinor: latest.minorKey, recorded, appVersion: latest.appVersion });
    } catch (e) {
      results.push({ component, recorded: false, error: (e as Error).message });
    }
  }

  const newlyOutdated = results.filter((r) => !r.error && !r.recorded);
  const failed = results.filter((r) => r.error);

  if (values.json) {
    printJson(results);
  } else {
    for (const r of results) {
      if (r.error) {
        console.log(`?   ${r.component}: 取得失敗(${r.error})`);
      } else if (!r.recorded) {
        const app = r.appVersion ? ` [appVersion: ${r.appVersion}]` : "";
        console.log(`NEW ${r.component}: 最新 ${r.latest}(${r.latestMinor}) が matrix 未収録${app}`);
      }
    }
    if (newlyOutdated.length === 0 && failed.length === 0) {
      console.log("OK: 全component が最新リリースまで matrix に収録されています");
    }
  }
  if (newlyOutdated.length > 0 || failed.length > 0) process.exit(1);
}
