import * as sync from "./sync.ts";

export function run(argv: string[]): void {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "sync":
      return sync.run(rest);
    default:
      throw new Error(`不明な renovate サブコマンドです: ${sub ?? "(なし)"}(sync)`);
  }
}
