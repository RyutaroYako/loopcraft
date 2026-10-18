import { execFile } from "node:child_process";
import { basename, dirname } from "node:path";
import { diffDiagrams } from "@loopcraft/core/diff";
import type { DiagramDiff } from "@loopcraft/core/diff";
import { createEmptyDiagram, formatDiagramError, parseDiagramJson } from "@loopcraft/core/io";
import type { Diagram } from "@loopcraft/core/schema";
import type { Context } from "../context.ts";
import { isFailure, loadDiagram, locate } from "../load.ts";
import { done, failure, usageError } from "../outcome.ts";
import type { Outcome } from "../outcome.ts";
import { printData } from "../output.ts";

export interface DiffOptions {
  format: "text" | "json";
  base: string;
}

export interface DiffDependencies {
  /** git show <rev>:<path> の中身。そのリビジョンにファイルが無ければ null */
  showFile?: (revision: string, path: string) => Promise<string | null>;
}

export async function diff(
  files: string[],
  options: DiffOptions,
  context: Context,
  dependencies: DiffDependencies = {},
): Promise<Outcome> {
  const { log } = context;
  if (files.length === 0 || files.length > 2) {
    return usageError("比べるファイルを 1 つ（git と比べる）か 2 つ指定してください", {
      suggestions: ["loopcraft diff diagram.json", "loopcraft diff before.json after.json"],
    });
  }
  const after = await loadDiagram(files.at(-1)!, context);
  if (isFailure(after)) return after;

  let before: Diagram;
  let base: string;
  if (files.length === 2) {
    const loaded = await loadDiagram(files[0]!, context);
    if (isFailure(loaded)) return loaded;
    before = loaded.diagram;
    base = loaded.shown;
  } else {
    const showFile = dependencies.showFile ?? gitShow;
    let text: string | null;
    try {
      text = await showFile(options.base, locate(files[0]!, context).path);
    } catch (error) {
      const reason = errorText(error);
      return failure(`git から ${options.base} の版を読めません（${reason}）`, {
        code: "GIT_ERROR",
        suggestions: [
          /not a git repository/.test(reason)
            ? "git の管理下に無いときは、比べる 2 つのファイルを指定してください"
            : `--base の版を git log --oneline で確かめてください`,
        ],
      });
    }
    if (text === null) {
      before = createEmptyDiagram("");
    } else {
      const parsed = parseDiagramJson(text);
      if (!parsed.ok) {
        return failure(
          `${options.base} の版を開けません\n  ${parsed.errors.map(formatDiagramError).join("\n  ")}`,
          { code: "INVALID_DIAGRAM" },
        );
      }
      before = parsed.diagram;
    }
    base = text === null ? `${options.base}（ファイルが無い）` : options.base;
  }

  const result = diffDiagrams(before, after.diagram);
  if (options.format === "json") {
    printData(log, { base, file: after.shown, ...result });
    return done;
  }
  printDiff(context, base, after.shown, result);
  return done;
}

function printDiff({ log }: Context, base: string, file: string, result: DiagramDiff) {
  if (!result.changed) {
    log.info(`${base} と ${file} に違いはありません`);
    return;
  }
  log.info(`${base} → ${file}`);
  const { variables, links, loops, featured } = result;
  if (result.title) log.output(`~ タイトル: ${result.title.before} → ${result.title.after}`);
  for (const item of variables.added) log.output(`+ 変数 ${item.label}（${item.id}）`);
  for (const item of variables.removed) log.output(`- 変数 ${item.label}（${item.id}）`);
  for (const item of variables.renamed)
    log.output(`~ 変数 ${item.before} → ${item.after}（${item.id}）`);
  for (const item of links.added)
    log.output(`+ 関連 ${item.from} → ${item.to}（${item.polarity}）`);
  for (const item of links.removed)
    log.output(`- 関連 ${item.from} → ${item.to}（${item.polarity}）`);
  for (const item of links.changed) {
    log.output(`~ 関連 ${item.from} → ${item.to}: ${item.changes.join("、")}`);
  }
  for (const item of loops.added) log.output(`+ ループ ${item.kind}: ${item.route.join(" → ")}`);
  for (const item of loops.removed) log.output(`- ループ ${item.kind}: ${item.route.join(" → ")}`);
  for (const item of loops.flipped) {
    log.output(`~ ループ ${item.before} → ${item.kind}: ${item.route.join(" → ")}`);
  }
  for (const name of featured.added) log.output(`+ 注目するループ ${name}`);
  for (const name of featured.removed) log.output(`- 注目するループ ${name}`);
  for (const path of result.other) log.output(`~ ${path}`);
  if (variables.moved > 0) log.note(`位置だけが変わった変数: ${variables.moved} 個`);
}

/** パスをリポジトリの根からでなく ./ から書くのは、どの階層で実行しても同じファイルを指すため */
function gitShow(revision: string, path: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["show", `${revision}:./${basename(path)}`],
      // 言語を固定するのは、git のメッセージが訳されると、ファイルが無いことを見分けられなくなるため
      { cwd: dirname(path), maxBuffer: 64 * 1024 * 1024, env: { ...process.env, LC_ALL: "C" } },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout);
        if (/does not exist in|exists on disk, but not in/.test(stderr)) return resolve(null);
        reject(new Error(stderr.trim() || error.message));
      },
    );
  });
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
