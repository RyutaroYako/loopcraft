/**
 * release.yml から呼ぶ。
 * 公開済みの版を失敗にせず公開だけ飛ばすのは、公開の後で失敗したジョブを再実行できるようにするため
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import * as v from "valibot";

const PACKAGE = "loopcraft";

const PackageSchema = v.object({ version: v.string() });
const RegistrySchema = v.object({
  versions: v.record(v.string(), v.unknown()),
  "dist-tags": v.record(v.string(), v.string()),
});

function fail(message: string): never {
  console.log(`::error::${message}`);
  process.exit(1);
}

function compare(a: string, b: string) {
  const [x, y] = [a, b].map((version) => version.split(".").map(Number));
  for (let index = 0; index < 3; index++) {
    const diff = (x![index] ?? 0) - (y![index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function parseOrFail<T extends v.GenericSchema>(schema: T, input: unknown, source: string) {
  const result = v.safeParse(schema, input);
  if (result.success) return result.output;
  const issues = result.issues.map((issue) => `${v.getDotPath(issue) ?? ""}: ${issue.message}`);
  return fail(`${source} の形が想定と違います（${issues.join(", ")}）`);
}

const tag = process.env.GITHUB_REF_NAME ?? "";
const sha = process.env.GITHUB_SHA ?? "HEAD";
const { version } = parseOrFail(
  PackageSchema,
  JSON.parse(readFileSync("apps/cli/package.json", "utf8")),
  "apps/cli/package.json",
);

if (tag !== `v${version}`) {
  fail(
    `タグ ${tag} が apps/cli/package.json の版 ${version} と一致しません。` +
      `タグを消して（git push --delete origin ${tag}）、main で vpr release からやり直してください`,
  );
}
try {
  execFileSync("git", ["merge-base", "--is-ancestor", sha, "origin/main"]);
} catch {
  fail(
    `タグ ${tag} のコミットが main にありません。` +
      `タグを消して（git push --delete origin ${tag}）、最新の main で vpr release からやり直してください`,
  );
}

const response = await fetch(`https://registry.npmjs.org/${PACKAGE}`);
if (!response.ok && response.status !== 404) {
  fail(`npm から ${PACKAGE} の情報を取得できませんでした（HTTP ${response.status}）`);
}
const registry =
  response.status === 404
    ? undefined
    : parseOrFail(RegistrySchema, await response.json(), `npm の ${PACKAGE} の情報`);
if (!registry) {
  console.log(
    `::notice::${PACKAGE} はまだ npm にありません。trusted publisher はパッケージが npm にあるときだけ登録できるので、最初の版は手元から公開してください`,
  );
}

const published = registry?.versions[version] !== undefined;
const prerelease = version.includes("-");
const latest = registry?.["dist-tags"].latest;
if (!published && !prerelease && latest && compare(version, latest) < 0) {
  fail(`${version} は npm の latest（${latest}）より古いので公開しません`);
}
if (published) {
  console.log(`::notice::${PACKAGE}@${version} は公開済みなので、npm への公開を飛ばします`);
}

const outputs = {
  version,
  published: String(published),
  prerelease: String(prerelease),
  "dist-tag": prerelease ? "next" : "latest",
};
const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines.join(""));
console.log(outputs);
