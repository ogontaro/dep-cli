import * as add from "./add.ts";
import * as outdated from "./outdated.ts";
import * as rm from "./rm.ts";
import * as show from "./show.ts";
import * as validate from "./validate.ts";

export async function run(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "show":
      return show.run(rest);
    case "add":
      return add.run(rest);
    case "rm":
      return rm.run(rest);
    case "validate":
      return validate.run(rest);
    case "outdated":
      return outdated.run(rest);
    default:
      throw new Error(`不明な matrix サブコマンドです: ${sub ?? "(なし)"}(show/add/rm/validate/outdated)`);
  }
}
