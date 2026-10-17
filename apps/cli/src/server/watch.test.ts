import { readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { stringifyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { revisionOf } from "../files.ts";
import { createWorkspace, writeSample } from "../testing/fixtures.ts";
import {
  api,
  closeServers,
  openEvents,
  send,
  start,
  startTracked,
  TOKEN,
} from "../testing/server.ts";

afterEach(closeServers);

describe("ほかの場所での変更", () => {
  it("読み込みが割り込んでも、ほかの場所での変更を知らせ損ねない", async () => {
    const { server, file } = await start();
    const events = await openEvents(server);
    await events.next(": connected");
    await writeFile(file, stringifyDiagram({ ...createSampleDiagram(), title: "外部" }));
    await api(server, "/api/document");
    expect(await events.next("event: change")).toContain('"writer":null');
    events.close();
  });

  it("ディレクトリが無くなったら、見張れなくなったことを後からつないだ画面にも知らせる", async () => {
    const { server, file, stderr } = await start();
    const events = await openEvents(server);
    await events.next(": connected");
    await rm(dirname(file), { recursive: true, force: true });
    expect(await events.next("event: watch-error")).toContain("無くなりました");
    expect(stderr.at(-1)).toMatch(/^⚠ ほかの場所での変更を見張れなくなりました/);
    events.close();
    const later = await openEvents(server);
    expect(await later.next("event: watch-error")).toContain("無くなりました");
    later.close();
  });

  it("つないだ時点の版と、それを書いた画面を知らせる", async () => {
    const { server, file } = await start();
    const events = await openEvents(server);
    expect(await events.next("event: revision")).toContain(
      `"revision":"${revisionOf(await readFile(file, "utf8"))}","writer":null`,
    );
    events.close();
    await api(server, "/api/document", {
      method: "PUT",
      headers: { "x-loopcraft-client": "tab-a" },
      body: JSON.stringify({ diagram: createSampleDiagram(), baseRevision: null, force: true }),
    });
    const later = await openEvents(server);
    expect(await later.next("event: revision")).toContain('"writer":"tab-a"');
    later.close();
  });

  it("シンボリックリンクなら、リンク先の変更を見張る", async () => {
    const workspace = await createWorkspace();
    const elsewhere = await createWorkspace();
    const target = await writeSample(elsewhere.cwd, "real.json");
    const link = join(workspace.cwd, "link.json");
    await symlink(target, link);
    const server = await startTracked({
      file: link,
      readonly: false,
      log: workspace.logger,
      token: TOKEN,
    });
    const events = await openEvents(server);
    await events.next("event: revision");
    await writeFile(target, stringifyDiagram({ ...createSampleDiagram(), title: "リンク先" }));
    expect(await events.next("event: change")).toContain('"writer":null');
    events.close();
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
});
