import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Prompts } from "./interactive.ts";
import { runCli } from "./program.ts";
import { createWebDir, createWorkspace, writeSample } from "./testing/fixtures.ts";

const webDir = await createWebDir();
vi.mock("./web-dir.ts", () => ({ resolveWebDir: () => webDir }));

function fakePrompts(overrides: Partial<Prompts> = {}): Prompts {
  return {
    chooseCommand: vi.fn(async () => undefined),
    chooseFile: vi.fn(async () => undefined),
    chooseFiles: vi.fn(async () => undefined),
    askInit: vi.fn(async () => undefined),
    cancelled: vi.fn(),
    ...overrides,
  };
}

async function run(args: string[], options: { interactive?: boolean; prompts?: Prompts } = {}) {
  const workspace = await createWorkspace();
  await writeSample(workspace.cwd);
  const prompts = options.prompts ?? fakePrompts();
  const openBrowser = vi.fn(async () => undefined);
  const exitCode = await runCli(["node", "loopcraft", ...args], {
    context: workspace.context,
    version: "9.9.9",
    canPrompt: () => options.interactive ?? false,
    prompts,
    openBrowser,
    waitForExit: async () => undefined,
  });
  return { exitCode, prompts, openBrowser, ...workspace };
}

describe("runCli", () => {
  it("引数が無く対話できなければヘルプを出す", async () => {
    const { exitCode, stdout } = await run([]);
    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain("Usage: loopcraft");
  });

  it("ヘルプとバージョン", async () => {
    expect((await run(["--help"])).exitCode).toBe(0);
    const version = await run(["--version"]);
    expect(version.exitCode).toBe(0);
    expect(version.stdout).toEqual(["9.9.9"]);
  });

  it("知らないコマンドや誤ったオプションは終了コード 2", async () => {
    const unknown = await run(["draw"]);
    expect(unknown.exitCode).toBe(2);
    expect(unknown.stderr.join("\n")).toContain("知らないコマンドです: draw");
    expect((await run(["loops", "diagram.json", "--format", "csv"])).exitCode).toBe(2);
    expect((await run(["serve", "diagram.json", "--port", "abc"])).exitCode).toBe(2);
    expect((await run(["serve", "diagram.json", "--port", "70000"])).exitCode).toBe(2);
    expect((await run(["validate", "--bogus"])).exitCode).toBe(2);
    expect((await run(["loops", "diagram.json", "extra.json"])).exitCode).toBe(2);
    expect((await run(["schema", "extra"])).exitCode).toBe(2);
  });

  it("コマンドを実行し、最初にヘッダーを出す", async () => {
    const result = await run(["validate", "diagram.json"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr[0]).toBe("Loopcraft — 因果ループ図エディタ v9.9.9");
    expect((await run(["loops", "diagram.json", "--kind", "r"])).stdout[0]).toBe(
      "R1  成長エンジン",
    );
    expect(JSON.parse((await run(["schema"])).stdout.join("\n"))).toMatchObject({ type: "object" });
  });

  it("失敗は終了コード 1、使い方の誤りは 2", async () => {
    expect((await run(["validate", "none.json"])).exitCode).toBe(1);
    const missing = await run(["validate"]);
    expect(missing.exitCode).toBe(2);
    expect(missing.stderr.at(-1)).toBe(
      "✗ 検証するファイルを指定してください（例: loopcraft validate diagram.json）",
    );
    expect((await run(["loops"])).exitCode).toBe(2);
    expect((await run(["serve"])).exitCode).toBe(2);
  });

  it("init は既定のファイル名で作る", async () => {
    const result = await run(["init", "--title", "題"]);
    expect(result.exitCode).toBe(2);
    const fresh = await run(["init", "fresh.json", "--sample"]);
    expect(fresh.exitCode).toBe(0);
    expect(JSON.parse(await readFile(join(fresh.cwd, "fresh.json"), "utf8"))).toMatchObject({
      title: "組織の成長と人の負荷",
    });
  });

  it("serve はサーバーを開き、合図で閉じる", async () => {
    const result = await run(["serve", "diagram.json", "--port", "0", "--edit"]);
    expect(result.exitCode).toBe(0);
    expect(result.openBrowser).toHaveBeenCalledOnce();
    expect(result.stderr).toContain("✓ diagram.json を開きました（編集モード）");
    expect(result.stderr.at(-1)).toBe("✓ 終了しました");
    const sample = await run(["serve", "new.json", "--port", "0", "--sample"]);
    expect(sample.stderr).toContain(
      "  サンプルの図を表示しています。編集して保存すると new.json を作ります",
    );
    const noOpen = await run(["serve", "diagram.json", "--port", "0", "--no-open", "--readonly"]);
    expect(noOpen.openBrowser).not.toHaveBeenCalled();
  });

  describe("対話できるとき", () => {
    it("足りない引数を聞く", async () => {
      const chooseFile = vi.fn(async () => "diagram.json");
      const askInit = vi.fn(async () => ({ file: "asked.json", sample: true }));
      const prompts = fakePrompts({
        chooseFiles: vi.fn(async () => ["diagram.json"]),
        chooseFile,
        askInit,
      });
      expect((await run(["validate"], { interactive: true, prompts })).exitCode).toBe(0);
      expect((await run(["loops"], { interactive: true, prompts })).exitCode).toBe(0);
      expect((await run(["serve", "--port", "0"], { interactive: true, prompts })).exitCode).toBe(
        0,
      );
      chooseFile.mockResolvedValueOnce("new.json");
      await run(["serve", "--port", "0", "--sample"], { interactive: true, prompts });
      expect(chooseFile).toHaveBeenLastCalledWith(expect.any(String), {
        message: "開くファイル",
        allowNew: true,
        newOnly: true,
      });
      const init = await run(["init"], { interactive: true, prompts });
      expect(init.exitCode).toBe(0);
      expect(
        JSON.parse(await readFile(join(init.cwd, "asked.json"), "utf8")).variables.length,
      ).toBeGreaterThan(0);
      expect(askInit).toHaveBeenLastCalledWith({ sample: undefined });
      await run(["init", "--sample"], { interactive: true, prompts });
      expect(askInit).toHaveBeenLastCalledWith({ sample: true });
    });

    it("図のファイルが選べなければ使い方の誤りにする", async () => {
      const prompts = fakePrompts({ chooseFile: vi.fn(async () => null) });
      const loops = await run(["loops"], { interactive: true, prompts });
      expect(loops.exitCode).toBe(2);
      expect(loops.stderr.at(-1)).toBe("✗ 図の JSON ファイルが見つかりません");
      expect((await run(["serve"], { interactive: true, prompts })).exitCode).toBe(2);
    });

    it("選べる JSON が無ければ使い方の誤りにする", async () => {
      const prompts = fakePrompts({ chooseFiles: vi.fn(async () => []) });
      const result = await run(["validate"], { interactive: true, prompts });
      expect(result.exitCode).toBe(2);
      expect(result.stderr.at(-1)).toBe("✗ 検証できる JSON ファイルが見つかりません");
    });

    it("コマンドをメニューから選んで実行する", async () => {
      const prompts = fakePrompts({ chooseCommand: vi.fn(async () => "schema" as const) });
      const result = await run([], { interactive: true, prompts });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join("\n")).toContain('"type": "object"');
      expect(result.stderr.filter((line) => line.startsWith("Loopcraft"))).toHaveLength(1);
    });

    it("キャンセルしたら何もせず終える", async () => {
      const cancelled = vi.fn();
      const prompts = fakePrompts({ cancelled });
      expect((await run([], { interactive: true, prompts })).exitCode).toBe(0);
      expect((await run(["init"], { interactive: true, prompts })).exitCode).toBe(0);
      expect(cancelled).toHaveBeenCalledTimes(2);
    });
  });
});
