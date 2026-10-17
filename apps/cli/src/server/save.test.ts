import { readFile, writeFile } from "node:fs/promises";
import { stringifyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { revisionOf } from "../files.ts";
import { api, closeServers, openEvents, send, start, TOKEN } from "../testing/server.ts";

afterEach(closeServers);

describe("保存", () => {
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

  it("前提が古くても、今の内容を書いた同じ画面の保存は受け付ける", async () => {
    const { server, file } = await start();
    const base = revisionOf(await readFile(file, "utf8"));
    const put = (writer: string, title: string) =>
      api(server, "/api/document", {
        method: "PUT",
        headers: { "x-loopcraft-client": writer },
        body: JSON.stringify({ diagram: { ...createSampleDiagram(), title }, baseRevision: base }),
      });
    expect((await put("tab-a", "1")).status).toBe(200);
    expect((await put("tab-a", "2")).status).toBe(200);
    expect((await put("tab-b", "3")).status).toBe(409);
    await writeFile(file, stringifyDiagram({ ...createSampleDiagram(), title: "外部" }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect((await put("tab-a", "4")).status).toBe(409);
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
    const index = await send(server, `/?token=${TOKEN}`);
    expect(index.body).toContain("&quot;readonly&quot;:true");
    const rejected = await api(server, "/api/document", {
      method: "PUT",
      body: JSON.stringify({ diagram: createSampleDiagram(), baseRevision: null }),
    });
    expect(rejected.status).toBe(405);
  });

  it("保存をほかの画面へ書き手つきで知らせ、同時の保存は 1 つずつ確かめる", async () => {
    const { server, file } = await start();
    const events = await openEvents(server);
    await events.next(": connected");
    const base = revisionOf(await readFile(file, "utf8"));
    const put = (title: string) =>
      api(server, "/api/document", {
        method: "PUT",
        headers: { "x-loopcraft-client": `tab-${title}` },
        body: JSON.stringify({ diagram: { ...createSampleDiagram(), title }, baseRevision: base }),
      });
    const [first, second] = await Promise.all([put("a"), put("b")]);
    expect([first.status, second.status].toSorted((a, b) => a - b)).toEqual([200, 409]);
    const change = await events.next("event: change");
    expect(change).toMatch(/"writer":"tab-[ab]"/);
    events.close();
  });
});
