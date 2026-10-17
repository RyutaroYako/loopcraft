import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { exists } from "../files.ts";
import type { RunningServer } from "../server/server.ts";
import { createWebDir, createWorkspace, writeSample } from "../testing/fixtures.ts";
import { serve } from "./serve.ts";

vi.mock("../web-dir.ts", () => ({ resolveWebDir: () => undefined }));

let running: RunningServer | undefined;

async function start(...args: Parameters<typeof serve>) {
  const started = await serve(...args);
  if (started.kind !== "serving") throw new Error(started.message);
  return started.server;
}
afterEach(async () => {
  await running?.close();
  running = undefined;
});

describe("serve", () => {
  it("開いた URL を伝え、ブラウザを開く", async () => {
    const { context, stderr } = await createWorkspace();
    await writeSample(context.cwd);
    const openBrowser = vi.fn(async () => undefined);
    running = await start("diagram.json", { port: 0 }, context, {
      openBrowser,
      webDir: await createWebDir(),
    });
    expect(openBrowser).toHaveBeenCalledWith(running.url);
    expect(stderr[0]).toBe("✓ diagram.json を開きました");
    expect(stderr).toContain(
      "  変更はこのファイルに自動で保存します。見せるだけなら --readonly を付けてください",
    );
    expect(stderr[1]).toBe(`ℹ ${running.url}`);
  });

  it("ブラウザを開けなくても続け、--no-open なら開かない", async () => {
    const { context, stderr } = await createWorkspace();
    running = await start("new.json", { port: 0 }, context, {
      openBrowser: async () => Promise.reject(new Error("no browser")),
      webDir: await createWebDir(),
    });
    expect(stderr[0]).toBe("✓ new.json を開きました");
    expect(stderr.at(-1)).toMatch(/^⚠ ブラウザを開けませんでした/);
    await running.close();

    const second = await createWorkspace();
    const openBrowser = vi.fn(async () => undefined);
    running = await start("x.json", { port: 0, open: false, readonly: true }, second.context, {
      openBrowser,
      webDir: await createWebDir(),
    });
    expect(openBrowser).not.toHaveBeenCalled();
    expect(second.stderr[0]).toBe("✓ x.json を開きました（読み取り専用）");
    expect(second.stderr.join("\n")).not.toContain("自動で保存します");
  });

  it("--sample は新しいファイルだけに使え、保存するまでファイルを作らない", async () => {
    const { context, stderr } = await createWorkspace();
    running = await start("new.json", { port: 0, open: false, sample: true }, context, {
      webDir: await createWebDir(),
    });
    expect(stderr).toContain(
      "  サンプルの図を表示しています。編集して保存すると new.json を作ります",
    );
    expect(await exists(join(context.cwd, "new.json"))).toBe(false);
    await running.close();
    running = undefined;

    await writeSample(context.cwd);
    expect(
      await serve("diagram.json", { port: 0, sample: true }, context, {
        webDir: await createWebDir(),
      }),
    ).toMatchObject({
      kind: "usage",
      message: expect.stringContaining("diagram.json は既にあります"),
    });
  });

  it("既定のポートが使えなければ空いているポートへ逃げる", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", () => resolve()));
    const port = (blocker.address() as { port: number }).port;
    const { context } = await createWorkspace();
    running = await start("d.json", {}, context, {
      webDir: await createWebDir(),
      defaultPort: port,
    });
    expect(running.port).not.toBe(port);
    await expect(
      serve("d.json", { port }, context, { webDir: await createWebDir() }),
    ).rejects.toMatchObject({ code: "EADDRINUSE" });
    blocker.close();
  });

  it("開けない場所や、エディタが無いときは止める", async () => {
    const { context } = await createWorkspace();
    expect(await serve("missing/d.json", { port: 0 }, context)).toMatchObject({ kind: "usage" });
    await mkdir(join(context.cwd, "folder"));
    expect(await serve("folder", { port: 0 }, context)).toMatchObject({
      kind: "usage",
      message: expect.stringContaining("ディレクトリです"),
    });
    expect(await serve("d.json", { port: 0 }, context)).toMatchObject({
      kind: "failure",
      message: expect.stringContaining("エディタのファイルが見つかりません"),
    });
  });
});
