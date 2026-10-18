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

async function run(
  args: string[],
  options: { interactive?: boolean; prompts?: Prompts; stdin?: string | Error } = {},
) {
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
    readStdin: () => {
      const { stdin } = options;
      if (stdin === undefined) return undefined;
      return stdin instanceof Error ? Promise.reject(stdin) : Promise.resolve(stdin);
    },
  });
  return { exitCode, prompts, openBrowser, ...workspace };
}

describe("runCli", () => {
  it("引数が無く対話できなければヘルプを出す", async () => {
    const { exitCode, stdout } = await run([]);
    expect(exitCode).toBe(0);
    const help = stdout.join("\n");
    expect(help).toContain("Usage: loopcraft");
    expect(help).not.toMatch(/^\s+init\b/m);
  });

  it("ヘルプとバージョン", async () => {
    expect((await run(["--help"])).exitCode).toBe(0);
    const version = await run(["--version"]);
    expect(version.exitCode).toBe(0);
    expect(version.stdout).toEqual(["9.9.9"]);
  });

  it("書き違いには、日本語の説明と、そのまま打てる正しいコマンドを返す", async () => {
    const expectError = async (args: string[], message: string, suggestions?: string[]) => {
      const result = await run(args);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain(`✗ ${message}`);
      for (const suggestion of suggestions ?? [])
        expect(result.stderr).toContain(`  → ${suggestion}`);
    };
    await expectError(["loops", "diagram.json", "--json"], "知らないオプション --json です", [
      "loopcraft loops diagram.json --format json",
    ]);
    await expectError(["check", "diagram.json", "--compat"], "知らないオプション --compat です", [
      "loopcraft check diagram.json --compact",
    ]);
    await expectError(["serve", "diagram.json", "--zzz"], "知らないオプション --zzz です", [
      "使えるオプションは loopcraft serve --help で確かめられます",
    ]);
    await expectError(
      ["loops", "diagram.json", "--format", "csv"],
      '--format に "csv" は使えません。使えるのは text, json, md です',
    );
    await expectError(
      ["serve", "diagram.json", "--port", "abc"],
      '--port の値 "abc" は使えません。0〜65535 の整数を指定してください',
    );
    await expectError(["render", "diagram.json", "-o"], "--output に値を付けてください", [
      "loopcraft render --help",
    ]);
    await expectError(["check"], "引数 file がありません", ["loopcraft check --help"]);
    await expectError(["schema", "extra"], "引数が多すぎます", ["loopcraft schema --help"]);
    await expectError(["lint", "diagram.json"], "不明なコマンドです: lint", [
      "loopcraft check diagram.json",
    ]);
    await expectError(["chek", "a b.json"], "不明なコマンドです: chek", [
      "loopcraft check 'a b.json'",
    ]);
    const typo = await run(["chek", "diagram.json", "--format", "json"]);
    expect(JSON.parse(typo.stdout.join(""))).toMatchObject({
      error: { suggestions: ["loopcraft check diagram.json --format json"] },
    });
    await expectError(["zzz"], "不明なコマンドです: zzz", [
      "使えるコマンドは serve, validate, loops, check, edit, layout, render, diff, agent-init, schema です（loopcraft --help）",
    ]);
  });

  it("--format json なら、失敗も同じ形の JSON で stdout に出す", async () => {
    const usage = await run(["loops", "diagram.json", "--format", "json", "--json"]);
    expect(JSON.parse(usage.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "INVALID_ARGUMENTS",
        message: "知らないオプション --json です",
        suggestions: ["loopcraft loops diagram.json --format json"],
      },
    });
    const missing = await run(["check", "none.json", "--format=json"]);
    expect(missing.exitCode).toBe(1);
    expect(JSON.parse(missing.stdout.join(""))).toMatchObject({
      ok: false,
      error: { code: "FILE_NOT_FOUND" },
    });
  });

  it("標準入力の操作で図を作り、調べ、画像にする", async () => {
    const stdin = [
      '{"op":"add-variable","id":"a","label":"A"}',
      '{"op":"add-variable","id":"b","label":"B"}',
      '{"op":"add-link","from":"a","to":"b"}',
    ].join("\n");
    const created = await run(["edit", "new.json", "--format", "json"], { stdin });
    expect(created.exitCode).toBe(0);
    expect(JSON.parse(created.stdout.join(""))).toMatchObject({
      ok: true,
      data: { created: true },
    });
    for (const args of [
      ["check", "diagram.json", "--compact"],
      ["layout", "diagram.json", "--all", "--pin", "staff, sales"],
      ["render", "diagram.json", "--theme", "dark", "--scale", "1.5"],
      ["diff", "diagram.json", "diagram.json"],
      ["agent-init"],
    ]) {
      expect((await run(args)).exitCode).toBe(0);
    }
    expect((await run(["render", "diagram.json", "--scale", "0"])).exitCode).toBe(2);
  });

  it("想定していない例外は終了コード 1 で、メッセージだけを出す", async () => {
    const result = await run(["edit", "d.json", "--format", "json"], {
      stdin: new Error("壊れた"),
    });
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout.join(""))).toMatchObject({
      ok: false,
      error: { code: "UNEXPECTED_ERROR", message: "壊れた" },
    });
  });

  it("知らないコマンドや誤ったオプションは終了コード 2", async () => {
    const unknown = await run(["draw"]);
    expect(unknown.exitCode).toBe(2);
    expect(unknown.stderr.join("\n")).toContain("不明なコマンドです: draw");
    expect((await run(["loops", "diagram.json", "--format", "csv"])).exitCode).toBe(2);
    expect((await run(["serve", "diagram.json", "--port", "abc"])).exitCode).toBe(2);
    expect((await run(["serve", "diagram.json", "--port", "70000"])).exitCode).toBe(2);
    expect((await run(["validate", "--bogus"])).exitCode).toBe(2);
    expect((await run(["loops", "diagram.json", "extra.json"])).exitCode).toBe(2);
    expect((await run(["schema", "extra"])).exitCode).toBe(2);
  });

  it("コマンドを実行し、端末で使うときだけ最初にヘッダーを出す", async () => {
    const result = await run(["validate", "diagram.json"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr[0]).toBe("✓ diagram.json");
    const interactive = await run(["validate", "diagram.json"], { interactive: true });
    expect(interactive.stderr[0]).toBe("Loopcraft — 因果ループ図エディタ v9.9.9");
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
    // --edit を付けるのは、廃止したフラグでも失敗せず知らせるだけなのを確かめるため
    expect(result.stderr).toContain(
      "⚠ --edit は不要になりました。serve は常に編集できる状態で開きます",
    );
    expect(result.stderr).toContain("✓ diagram.json を開きました");
    expect(result.stderr.at(-1)).toBe("✓ 終了しました");
    const sample = await run(["serve", "new.json", "--port", "0", "--sample"]);
    expect(sample.stderr).toContain(
      "  サンプルの図を表示しています。編集して保存すると new.json を作ります",
    );
    const noOpen = await run(["serve", "diagram.json", "--port", "0", "--no-open", "--readonly"]);
    expect(noOpen.openBrowser).not.toHaveBeenCalled();
    const both = await run(["serve", "diagram.json", "--port", "0", "--edit", "--readonly"]);
    expect(both.stderr).toContain(
      "⚠ --edit は不要になりました。--readonly を指定しているので読み取り専用で開きます",
    );
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
