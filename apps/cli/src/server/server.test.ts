import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SESSION_META_NAME, TOKEN_HEADER } from "@loopcraft/core/session";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { revisionOf } from "../files.ts";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { createWorkspace } from "../testing/fixtures.ts";
import { api, closeServers, send, start, startTracked, TOKEN } from "../testing/server.ts";
import { describeError, isAllowedHost } from "./http.ts";
import { injectSession } from "./static.ts";

afterEach(closeServers);

describe("startServer", () => {
  it("--sample ならセッションで伝える", async () => {
    const { server } = await start({ existing: false, sample: true });
    expect((await send(server, `/?token=${TOKEN}`)).body).toContain("&quot;sample&quot;:true");
  });

  it("エディタにセッションを埋め込んで配る", async () => {
    const { server } = await start();
    expect(server.url).toBe(`http://127.0.0.1:${server.port}/?token=${TOKEN}`);
    expect((await send(server, "/")).status).toBe(403);
    expect((await send(server, "/index.html?token=wrong")).status).toBe(403);
    expect((await send(server, "/assets/..%2Findex.html")).status).toBe(403);
    const index = await send(server, `/?token=${TOKEN}`);
    expect(index.status).toBe(200);
    expect(index.headers["cache-control"]).toBe("no-store");
    expect(index.body).toContain(`<meta name="${SESSION_META_NAME}"`);
    expect(index.body).toContain("&quot;readonly&quot;:false");
    expect(index.body).not.toContain("sample");
    const css = await send(server, "/app.css");
    expect(css.headers["content-type"]).toBe("text/css; charset=utf-8");
    expect((await send(server, "/favicon.ico")).headers["content-type"]).toBe("image/x-icon");
    expect((await send(server, "/blob.bin")).headers["content-type"]).toBe(
      "application/octet-stream",
    );
    expect((await send(server, "/missing.js")).status).toBe(404);
    expect((await send(server, "/..%2F..%2Fetc%2Fpasswd")).status).toBe(404);
    expect((await send(server, "/%E0%A4%A")).status).toBe(400);
    expect((await send(server, "/", { method: "POST" })).status).toBe(405);
    expect((await send(server, `/?token=${TOKEN}`, { method: "HEAD" })).status).toBe(200);
  });

  it("知らないホスト名と、トークンの無い API を拒む", async () => {
    const { server } = await start();
    expect((await send(server, `/?token=${TOKEN}`, { host: "evil.example" })).status).toBe(403);
    expect(
      (await send(server, `/?token=${TOKEN}`, { host: `localhost:${server.port}` })).status,
    ).toBe(200);
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
    await closeServers();

    const missing = await start({ existing: false });
    expect(JSON.parse((await api(missing.server, "/api/document")).body)).toEqual({
      status: "missing",
    });
    await closeServers();

    const broken = await start({ existing: false });
    await writeFile(broken.file, "{");
    expect(JSON.parse((await api(broken.server, "/api/document")).body)).toMatchObject({
      status: "invalid",
    });
  });
  it("ファイルを読めなければ理由つきで 500 を返し、無いものとして上書きしない", async () => {
    const { server, file, stderr } = await start({ existing: false });
    await mkdir(file);
    const loaded = await api(server, "/api/document");
    expect(loaded.status).toBe(500);
    expect(JSON.parse(loaded.body)).toMatchObject({ error: expect.stringMatching(/^EISDIR: /) });
    expect(stderr.at(-1)).toMatch(/^✗ リクエストを処理できませんでした: EISDIR/);
    const saved = await api(server, "/api/document", {
      method: "PUT",
      body: JSON.stringify({ diagram: createSampleDiagram(), baseRevision: null }),
    });
    expect(saved.status).toBe(500);
    expect(isAllowedHost(undefined, server.port)).toBe(false);
  });

  it("起動時に読めなければ伝える", async () => {
    const workspace = await createWorkspace();
    const file = join(workspace.cwd, "diagram.json");
    await mkdir(file);
    const server = await startTracked({ file, readonly: false, log: workspace.logger });
    expect(workspace.stderr[0]).toMatch(/^⚠ diagram.json を読めません: EISDIR/);
    expect(server.url).toMatch(/\?token=.+/);
  });

  it("見張りを始められなければ、待ち受けを閉じて伝える", async () => {
    const workspace = await createWorkspace();
    await expect(
      startTracked({
        file: join(workspace.cwd, "missing", "diagram.json"),
        readonly: false,
        log: workspace.logger,
      }),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("describeError", () => {
  it("コードがあれば先頭に付ける", () => {
    expect(describeError(Object.assign(new Error("denied"), { code: "EACCES" }))).toBe(
      "EACCES: denied",
    );
    expect(describeError(new Error("plain"))).toBe("plain");
    expect(describeError("text")).toBe("text");
  });
});

describe("injectSession", () => {
  it("属性として壊れないようにエスケープする", () => {
    const html = injectSession("<html><head></head></html>", {
      token: "a&b",
      file: '"<x>"',
      readonly: false,
    });
    expect(html).toContain("a&amp;b");
    expect(html).toContain("&lt;x&gt;");
    expect(html).not.toContain("<x>");
  });
});
