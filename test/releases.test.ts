import { expect, test } from "bun:test";
import { fetchLatestRelease } from "../src/releases.ts";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), { status: ok ? status : 500 });
}
function textResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

test("github-releases: prerelease/draftを除外し、最新minorのタグを返す", async () => {
  const fakeFetch = (async () =>
    jsonResponse([
      { tag_name: "v1.21.0", prerelease: false, draft: false },
      { tag_name: "v1.20.0", prerelease: false, draft: false },
      { tag_name: "v1.22.0-rc1", prerelease: true, draft: false },
    ])) as unknown as typeof fetch;

  const result = await fetchLatestRelease({ type: "github-releases", repo: "example/repo" }, fakeFetch);
  expect(result).toEqual({ minorKey: "1.21", version: "v1.21.0" });
});

test("github-releases: repo未指定は例外", async () => {
  await expect(fetchLatestRelease({ type: "github-releases" })).rejects.toThrow();
});

test("helm-index: entriesから最新minorとappVersionを返す", async () => {
  const index = `
entries:
  cilium:
    - version: 1.19.3
      appVersion: 1.19.3
    - version: 1.20.1
      appVersion: 1.20.1
`;
  const fakeFetch = (async () => textResponse(index)) as unknown as typeof fetch;
  const result = await fetchLatestRelease({ type: "helm-index", url: "https://example.com/index.yaml", chart: "cilium" }, fakeFetch);
  expect(result).toEqual({ minorKey: "1.20", version: "1.20.1", appVersion: "1.20.1" });
});

test("helm-index: chartが見つからなければ例外", async () => {
  const fakeFetch = (async () => textResponse("entries: {}")) as unknown as typeof fetch;
  await expect(
    fetchLatestRelease({ type: "helm-index", url: "https://example.com/index.yaml", chart: "missing" }, fakeFetch),
  ).rejects.toThrow(/missing/);
});
