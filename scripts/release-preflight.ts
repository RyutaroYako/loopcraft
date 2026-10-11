/**
 * vpr release の前に、最新の main にいることを確かめる。
 * 古い main や別のブランチでタグを作ると、push してもタグだけが届き、公開できないタグが残るため
 */
import { execFileSync } from "node:child_process";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const branch = git("branch", "--show-current");
if (branch !== "main") fail(`main で実行してください（今は ${branch || "ブランチの外"}）`);

git("fetch", "--quiet", "origin", "main");
if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
  fail(
    "main が origin/main と一致しません。git pull で最新にし、未 push のコミットを送ってから実行してください",
  );
}
