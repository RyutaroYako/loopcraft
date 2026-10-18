import { readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { Context } from "../context.ts";
import { exists, isNotFound } from "../files.ts";
import { done } from "../outcome.ts";
import type { Outcome } from "../outcome.ts";
import { printData } from "../output.ts";

export const BLOCK_START = "<!-- loopcraft:start -->";
export const BLOCK_END = "<!-- loopcraft:end -->";

/**
 * 道具の紹介でなく「何をどう使うか」の方針を書くのは、方針のほうが実際に使われるため。
 * 区切りを付けるのは、もう一度実行したときに同じ場所を書き換え、ほかの記述に触れないため
 */
export function agentBlock(run: string) {
  return [
    BLOCK_START,
    "## 因果ループ図（loopcraft）",
    "",
    `因果ループ図は loopcraft で作り、確かめる。作る・変えるときは \`${run} edit <file> -\` に操作を JSONL で渡し、\`${run} check <file>\` で構造と配置を確かめる。見た目は \`${run} render <file> -o <file>.png\` で画像にして見る。先に \`${run} --help\` を読む。`,
    BLOCK_END,
  ].join("\n");
}

export async function agentInit(
  options: { format: "text" | "json"; file?: string },
  { log, cwd }: Context,
): Promise<Outcome> {
  const name =
    options.file ??
    ((await exists(join(cwd, "AGENTS.md")))
      ? "AGENTS.md"
      : (await exists(join(cwd, "CLAUDE.md")))
        ? "CLAUDE.md"
        : "AGENTS.md");
  const path = resolve(cwd, name);
  const shown = relative(cwd, path) || name;
  const block = agentBlock(await detectRunner(cwd));
  let current: string | undefined;
  try {
    current = await readFile(path, "utf8");
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  let next: string;
  let action: "created" | "appended" | "updated" | "unchanged";
  if (current === undefined) {
    next = `${block}\n`;
    action = "created";
  } else {
    // 最初の開始の印から探さないのは、終わりの印の無い開始の印が残っていると、後ろのブロックまでの書き手の文章を消すため
    const end = current.indexOf(BLOCK_END);
    const start = end >= 0 ? current.lastIndexOf(BLOCK_START, end) : -1;
    if (start >= 0) {
      next = current.slice(0, start) + block + current.slice(end + BLOCK_END.length);
      action = next === current ? "unchanged" : "updated";
    } else {
      next = `${current.trimEnd()}\n\n${block}\n`;
      action = "appended";
    }
  }
  if (action !== "unchanged") await writeFile(path, next, "utf8");

  if (options.format === "json") {
    printData(log, { file: shown, action });
  } else {
    const message = {
      created: `${shown} を作り、loopcraft の使い方を書きました`,
      appended: `${shown} に loopcraft の使い方を追記しました`,
      updated: `${shown} の loopcraft の使い方を更新しました`,
      unchanged: `${shown} の loopcraft の使い方は最新です`,
    }[action];
    log.success(message);
  }
  return done;
}

/** いつも npx にしないのは、手元に入れた版と違う版を取りに行くことがあるため */
async function detectRunner(cwd: string) {
  if (await exists(join(cwd, "pnpm-lock.yaml"))) return "pnpm exec loopcraft";
  if (await exists(join(cwd, "yarn.lock"))) return "yarn loopcraft";
  if ((await exists(join(cwd, "bun.lock"))) || (await exists(join(cwd, "bun.lockb")))) {
    return "bunx loopcraft";
  }
  return "npx loopcraft";
}
