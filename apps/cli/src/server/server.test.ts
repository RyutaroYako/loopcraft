import { mkdir, readFile, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { join } from "node:path";
import { stringifyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { SESSION_META_NAME, TOKEN_HEADER } from "@loopcraft/core/session";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { revisionOf } from "../files.ts";
import { createWebDir, createWorkspace, writeSample } from "../testing/fixtures.ts";
import { injectSession, isAllowedHost, startServer, type RunningServer } from "./server.ts";

const TOKEN = "test-token";
let running: RunningServer | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

async function start(options: { readonly?: boolean; editable?: boolean; existing?: boolean } = {}) {
  const workspace = await createWorkspace();
  const file = join(workspace.cwd, "diagram.json");
  if (options.existing !== false) await writeSample(workspace.cwd);
  running = await startServer({
    file,
    webDir: await createWebDir(),
    port: 0,
    editable: options.editable ?? true,
    readonly: options.readonly ?? false,
    log: workspace.logger,
    token: TOKEN,
  });
  return { ...workspace, file, server: running };
}

/** Host ヘッダーを自由に付けたいので fetch ではなく http.request を使う */
function send(
  server: RunningServer,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; host?: string } = {},
) {
  return new Promise<{ status: number; body: string; headers: Record<string, unknown> }>(
    (resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port: server.port,
          path,
          method: init.method ?? "GET",
          headers: { host: init.host ?? `127.0.0.1:${server.port}`, ...init.headers },
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => (body += chunk));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
        },
      );
      req.on("error", reject);
      req.end(init.body);
    },
  );
}

const api = (server: RunningServer, path: string, init: Parameters<typeof send>[2] = {}) =>
  send(server, path, { ...init, headers: { [TOKEN_HEADER]: TOKEN, ...init.headers } });

describe("startServer", () => {
  it("エディタにセッションを埋め込んで配る", async () => {
    const { server } = await start({ editable: false });
    expect(server.url).toBe(`http://127.0.0.1:${server.port}/`);
    const index = await send(server, "/");
    expect(index.status).toBe(200);
    expect(index.headers["cache-control"]).toBe("no-store");
    expect(index.body).toContain(`<meta name="${SESSION_META_NAME}"`);
    expect(index.body).toContain("&quot;editable&quot;:false");
    const css = await send(server, "/app.css");
    expect(css.headers["content-type"]).toBe("text/css; charset=utf-8");
    expect((await send(server, "/blob.bin")).headers["content-type"]).toBe(
      "application/octet-stream",
    );
    expect((await send(server, "/missing.js")).status).toBe(404);
    expect((await send(server, "/..%2F..%2Fetc%2Fpasswd")).status).toBe(404);
    expect((await send(server, "/", { method: "POST" })).status).toBe(405);
    expect((await send(server, "/", { method: "HEAD" })).status).toBe(200);
  });

  it("知らないホスト名と、トークンの無い API を拒む", async () => {
    const { server } = await start();
    expect((await send(server, "/", { host: "evil.example" })).status).toBe(403);
    expect((await send(server, "/", { host: `localhost:${server.port}` })).status).toBe(200);
    expect((await send(server, "/api/document")).status).toBe(403);
    expect(
      (await api(server, "/api/document", { headers: { [TOKEN_HEADER]: "wrong" } })).status,
    ).toBe(403);
    expect((await api(server, "/api/unknown")).status).toBe(404);
  });

  it("ファイルの状態を返す", async () => {
    const ok = await start();
    const loaded = JSON.parse((await api(ok.server, "/api/document")).body) as {
      status: string;
      revision: string;
    };
    expect(loaded.status).toBe("ok");
    expect(loaded.revision).toBe(revisionOf(await readFile(ok.file, "utf8")));
    await running?.close();

    const missing = await start({ existing: false });
    expect(JSON.parse((await api(missing.server, "/api/document")).body)).toEqual({
      status: "missing",
    });
    await running?.close();

    const broken = await start({ existing: false });
    await writeFile(broken.file, "{");
    expect(JSON.parse((await api(broken.server, "/api/document")).body)).toMatchObject({
      status: "invalid",
    });
  });

  it("前提の版が合えば保存し、合わなければ競合を返す", async () => {
    const { server, file, stderr } = await start();
    const diagram = createSampleDiagram();
    diagram.title = "保存した";
    const base = revisionOf(await readFile(file, "utf8"));
    const saved = await api(server, "/api/document", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ diagram, baseRevision: base }),
    });
    expect(saved.status).toBe(200);
    const { revision } = JSON.parse(saved.body) as { revision: string };
    expect(revision).toBe(revisionOf(await readFile(file, "utf8")));
    expect(stderr).toContain("✓ diagram.json に保存しました");

    const stale = await api(server, "/api/document", {
      method: "PUT",
      body: JSON.stringify({ diagram, baseRevision: base }),
    });
    expect(stale.status).toBe(409);
    expect(JSON.parse(stale.body)).toEqual({ status: "conflict", revision });

    const forced = await api(server, "/api/document", {
      method: "PUT",
      body: JSON.stringify({ diagram: createSampleDiagram(), baseRevision: base, force: true }),
    });
    expect(forced.status).toBe(200);
  });

  it("ファイルが無ければ最初の保存で作る", async () => {
    const { server, file } = await start({ existing: false });
    const saved = await api(server, "/api/document", {
      method: "PUT",
      body: JSON.stringify({ diagram: createSampleDiagram(), baseRevision: null }),
    });
    expect(saved.status).toBe(200);
    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({
      title: "組織の成長と人の負荷",
    });
  });

  it("壊れた本文や形式の誤りは保存しない", async () => {
    const { server } = await start();
    expect((await api(server, "/api/document", { method: "PUT", body: "{" })).status).toBe(400);
    const invalid = await api(server, "/api/document", {
      method: "PUT",
      body: JSON.stringify({ diagram: { version: 1 }, baseRevision: null }),
    });
    expect(invalid.status).toBe(400);
    expect(JSON.parse(invalid.body)).toMatchObject({ error: "図の形式が正しくありません" });
    const huge = await api(server, "/api/document", {
      method: "PUT",
      body: "x".repeat(11 * 1024 * 1024),
    });
    expect(huge.status).toBe(400);
  });

  it("読み取り専用なら保存を拒む", async () => {
    const { server } = await start({ readonly: true });
    const index = await send(server, "/");
    expect(index.body).toContain("&quot;readonly&quot;:true");
    expect(index.body).toContain("&quot;editable&quot;:false");
    const rejected = await api(server, "/api/document", {
      method: "PUT",
      body: JSON.stringify({ diagram: createSampleDiagram(), baseRevision: null }),
    });
    expect(rejected.status).toBe(403);
  });

  it("ほかの場所での変更だけを知らせる", async () => {
    const { server, file, stderr } = await start();
    const events = await openEvents(server);
    await events.next(": connected");
    await writeFile(file, stringifyDiagram({ ...createSampleDiagram(), title: "外部" }));
    const change = await events.next("event: change");
    expect(change).toContain(`"revision":"${revisionOf(await readFile(file, "utf8"))}"`);
    expect(stderr).toContain("⚠ diagram.json がほかの場所で変更されました");
    events.close();
    expect((await send(server, "/api/events")).status).toBe(403);
  });

  it("ファイルを読めなければ 500 を返して伝える", async () => {
    const { server, file, stderr } = await start({ existing: false });
    await mkdir(file);
    expect((await api(server, "/api/document")).status).toBe(500);
    expect(stderr.at(-1)).toMatch(/^✗ リクエストを処理できませんでした/);
    expect(isAllowedHost(undefined, server.port)).toBe(false);
  });
});

describe("injectSession", () => {
  it("属性として壊れないようにエスケープする", () => {
    const html = injectSession("<html><head></head></html>", {
      token: "a&b",
      file: '"<x>"',
      editable: true,
      readonly: false,
    });
    expect(html).toContain("a&amp;b");
    expect(html).toContain("&lt;x&gt;");
    expect(html).not.toContain("<x>");
  });
});

async function openEvents(server: RunningServer) {
  const controller = new AbortController();
  const response = await fetch(`http://127.0.0.1:${server.port}/api/events?token=${TOKEN}`, {
    signal: controller.signal,
  });
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  return {
    async next(marker: string) {
      while (!buffer.includes(marker)) {
        const { value, done } = await reader.read();
        if (done) throw new Error("closed");
        buffer += value;
      }
      const index = buffer.indexOf(marker);
      const end = buffer.indexOf("\n\n", index);
      const chunk = buffer.slice(index, end);
      buffer = buffer.slice(end + 2);
      return chunk;
    },
    close: () => controller.abort(),
  };
}
