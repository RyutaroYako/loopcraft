import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { UsageError } from "../errors.ts";
import type { RunningServer } from "../server/server.ts";
import { createWebDir, createWorkspace, writeSample } from "../testing/fixtures.ts";
import { serve } from "./serve.ts";

vi.mock("../web-dir.ts", () => ({ resolveWebDir: () => undefined }));

let running: RunningServer | undefined;
afterEach(async () => {
  await running?.close();
  running = undefined;
});

describe("serve", () => {
  it("開いた URL を伝え、ブラウザを開く", async () => {
    const { context, stderr } = await createWorkspace();
    await writeSample(context.cwd);
    const openBrowser = vi.fn(async () => undefined);
    running = await serve("diagram.json", { port: 0, edit: true }, context, {
      openBrowser,
      webDir: await createWebDir(),
    });
    expect(openBrowser).toHaveBeenCalledWith(running.url);
    expect(stderr[0]).toBe("✓ diagram.json を開きました（編集モード）");
    expect(stderr[1]).toBe(`ℹ ${running.url}`);
  });

  it("ブラウザを開けなくても続け、--no-open なら開かない", async () => {
    const { context, stderr } = await createWorkspace();
    running = await serve("new.json", { port: 0 }, context, {
      openBrowser: async () => Promise.reject(new Error("no browser")),
      webDir: await createWebDir(),
    });
    expect(stderr[0]).toBe("✓ new.json を開きました（閲覧モード）");
    expect(stderr.at(-1)).toMatch(/^⚠ ブラウザを開けませんでした/);
    await running.close();

    const second = await createWorkspace();
    const openBrowser = vi.fn(async () => undefined);
    running = await serve("x.json", { port: 0, open: false, readonly: true }, second.context, {
      openBrowser,
      webDir: await createWebDir(),
    });
    expect(openBrowser).not.toHaveBeenCalled();
    expect(second.stderr[0]).toBe("✓ x.json を開きました（読み取り専用）");
  });

  it("既定のポートが使えなければ空いているポートへ逃げる", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", () => resolve()));
    const port = (blocker.address() as { port: number }).port;
    const { context } = await createWorkspace();
    running = await serve("d.json", {}, context, {
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
    await expect(serve("missing/d.json", { port: 0 }, context)).rejects.toBeInstanceOf(UsageError);
    await mkdir(join(context.cwd, "folder"));
    await expect(serve("folder", { port: 0 }, context)).rejects.toThrow("ディレクトリです");
    await expect(serve("d.json", { port: 0 }, context)).rejects.toThrow(
      "エディタのファイルが見つかりません",
    );
  });
});
