import { stringifyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { prepareStartup, resolveStartup, startInBrowser, startWithFile } from "./startup.ts";
import type { DocumentStore } from "./store.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const session = { token: "t", file: "dir/growth.json", readonly: false };
const store = { label: "growth.json" } as DocumentStore;

function withSession() {
  const doc = document.implementation.createHTMLDocument();
  const meta = doc.createElement("meta");
  meta.name = "loopcraft-session";
  meta.content = JSON.stringify(session);
  doc.head.append(meta);
  return doc;
}

describe("prepareStartup", () => {
  it("セッションが無ければ localStorage から開く", async () => {
    localStorage.setItem("loopcraft:document", stringifyDiagram(createSampleDiagram()));
    const startup = await prepareStartup(document.implementation.createHTMLDocument());
    expect(startup).toMatchObject({
      store: { label: "ブラウザ" },
      opened: { status: "ok" },
      sessionInvalid: false,
    });
  });

  it("セッションが壊れていれば、ブラウザに保存することを知らせる印を付ける", async () => {
    const doc = document.implementation.createHTMLDocument();
    const meta = doc.createElement("meta");
    meta.name = "loopcraft-session";
    meta.content = "{";
    doc.head.append(meta);
    expect(await prepareStartup(doc)).toMatchObject({
      store: { label: "ブラウザ" },
      sessionInvalid: true,
    });
  });

  it("セッションがあればサーバーから読む", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "missing" }))),
    );
    const startup = await prepareStartup(withSession());
    expect(startup).toMatchObject({
      store: { label: "dir/growth.json" },
      opened: { status: "missing" },
    });
  });
});

describe("startWithFile", () => {
  it("読めなかったファイルと、届かなかったサーバーは、どちらも開けなかったとする", () => {
    expect(
      startWithFile(session, { status: "invalid", revision: "r", errors: ["e"] }, store).opened,
    ).toEqual({ status: "unreadable", problems: ["e"] });
    expect(startWithFile(session, { status: "error", error: "HTTP 500" }, store).opened).toEqual({
      status: "unreadable",
      problems: ["HTTP 500"],
    });
  });

  it("まだ無いときは、ファイル名を題にした空の図か、指定があればサンプルで始める", () => {
    const missing = { status: "missing" } as const;
    expect(startWithFile(session, missing, store).blank.title).toBe("growth");
    expect(startWithFile({ ...session, file: ".json" }, missing, store).blank.title).toBe(
      "無題のシステム図",
    );
    expect(startWithFile({ ...session, sample: true }, missing, store).blank).toEqual(
      createSampleDiagram(),
    );
    expect(startWithFile({ ...session, readonly: true }, missing, store).readonly).toBe(true);
  });
});

describe("resolveStartup", () => {
  it("開けた図で始め、開けなければ空の図で始めて自動保存を止める", () => {
    const diagram = createSampleDiagram();
    expect(resolveStartup(startInBrowser({ status: "ok", diagram }))).toMatchObject({
      initial: diagram,
      readonly: false,
      initialStatus: undefined,
    });
    expect(resolveStartup(startInBrowser({ status: "missing" }))).toMatchObject({
      initial: { variables: [] },
      initialStatus: undefined,
    });
    expect(
      resolveStartup(startInBrowser({ status: "unreadable", problems: [], raw: "{" })),
    ).toMatchObject({
      initial: { variables: [] },
      initialStatus: { kind: "suspended", reason: "unreadable" },
    });
  });
});
