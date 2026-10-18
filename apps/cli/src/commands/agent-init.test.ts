import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { createWorkspace } from "../testing/fixtures.ts";
import { agentInit, BLOCK_END, BLOCK_START } from "./agent-init.ts";

describe("agent-init", () => {
  it("AGENTS.md が無ければ作り、もう一度実行しても同じ内容のままにする", async () => {
    const { context, stdout, stderr } = await createWorkspace();
    await agentInit({ format: "json" }, context);
    expect(JSON.parse(stdout[0]!)).toEqual({
      ok: true,
      data: { file: "AGENTS.md", action: "created" },
    });
    const text = await readFile(join(context.cwd, "AGENTS.md"), "utf8");
    expect(text).toContain("`npx loopcraft check <file>`");
    await agentInit({ format: "text" }, context);
    expect(stderr.at(-1)).toBe("✓ AGENTS.md の loopcraft の使い方は最新です");
    expect(await readFile(join(context.cwd, "AGENTS.md"), "utf8")).toBe(text);
  });

  it("CLAUDE.md しか無ければそこへ追記し、古いブロックは置き換える", async () => {
    const { context, stderr } = await createWorkspace();
    await writeFile(join(context.cwd, "CLAUDE.md"), "# 規約\n");
    await writeFile(join(context.cwd, "pnpm-lock.yaml"), "");
    await agentInit({ format: "text" }, context);
    expect(stderr.at(-1)).toBe("✓ CLAUDE.md に loopcraft の使い方を追記しました");
    const appended = await readFile(join(context.cwd, "CLAUDE.md"), "utf8");
    expect(appended.startsWith("# 規約\n\n<!-- loopcraft:start -->")).toBe(true);
    expect(appended).toContain("`pnpm exec loopcraft --help`");

    await writeFile(join(context.cwd, "CLAUDE.md"), `前\n${BLOCK_START}\n古い\n${BLOCK_END}\n後\n`);
    await agentInit({ format: "text" }, context);
    expect(stderr.at(-1)).toBe("✓ CLAUDE.md の loopcraft の使い方を更新しました");
    const updated = await readFile(join(context.cwd, "CLAUDE.md"), "utf8");
    expect(updated).toMatch(/^前\n<!-- loopcraft:start -->\n## 因果ループ図/);
    expect(updated.endsWith(`${BLOCK_END}\n後\n`)).toBe(true);
  });

  it("パッケージマネージャーに合わせたコマンドを書き、指定したファイルへ書ける", async () => {
    for (const [lock, run] of [
      ["yarn.lock", "yarn loopcraft"],
      ["bun.lock", "bunx loopcraft"],
      ["bun.lockb", "bunx loopcraft"],
    ]) {
      const { context } = await createWorkspace();
      await writeFile(join(context.cwd, lock!), "");
      await agentInit({ format: "text", file: "docs.md" }, context);
      expect(await readFile(join(context.cwd, "docs.md"), "utf8")).toContain(`\`${run} --help\``);
    }
  });

  it("--file には絶対パスも書ける", async () => {
    const { context, stdout } = await createWorkspace();
    const other = await createWorkspace();
    await agentInit({ format: "json", file: join(other.cwd, "AG.md") }, context);
    expect(await readFile(join(other.cwd, "AG.md"), "utf8")).toContain(BLOCK_START);
    expect(JSON.parse(stdout[0]!).data.action).toBe("created");
  });
});
