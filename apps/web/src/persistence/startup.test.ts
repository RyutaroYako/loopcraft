import { stringifyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { prepareStartup, resolveStartup } from "./startup.ts";
import type { Startup } from "./startup.ts";
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
    expect(startup).toMatchObject({ kind: "browser", stored: { status: "ok" } });
  });

  it("セッションが壊れていれば、ブラウザに保存することを知らせる印を付ける", async () => {
    const doc = document.implementation.createHTMLDocument();
    const meta = doc.createElement("meta");
    meta.name = "loopcraft-session";
    meta.content = "{";
    doc.head.append(meta);
    expect(await prepareStartup(doc)).toMatchObject({ kind: "browser", sessionInvalid: true });
  });

  it("セッションがあればサーバーから読む", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "missing" }))),
    );
    const startup = await prepareStartup(withSession());
    expect(startup).toMatchObject({ kind: "file", loaded: { status: "missing" } });
  });
});

describe("resolveStartup", () => {
  it("ブラウザでは保存されていた図を開き、問題があればその状態から始める", () => {
    const diagram = createSampleDiagram();
    expect(resolveStartup({ kind: "browser", stored: { status: "ok", diagram } })).toMatchObject({
      initial: diagram,
      readonly: false,
      initialStatus: undefined,
    });
    expect(
      resolveStartup({ kind: "browser", stored: { status: "empty" } }).initial.variables,
    ).toEqual([]);
    expect(
      resolveStartup({ kind: "browser", stored: { status: "unavailable", error: "x" } })
        .initialStatus,
    ).toEqual({
      kind: "failing",
      error: "x",
    });
    expect(
      resolveStartup({ kind: "browser", stored: { status: "invalid", raw: "{", errors: [] } })
        .initialStatus,
    ).toEqual({
      kind: "suspended",
      reason: "unreadable",
    });
  });

  it("ファイルではセッションの指定どおりに開く", () => {
    const diagram = createSampleDiagram();
    const file = (
      loaded: Extract<Startup, { kind: "file" }>["loaded"],
      overrides = {},
    ): Startup => ({
      kind: "file",
      session: { ...session, ...overrides },
      loaded,
      store,
    });
    expect(resolveStartup(file({ status: "ok", diagram, revision: "r" }))).toMatchObject({
      initial: diagram,
      readonly: false,
      store,
    });
    const missing = resolveStartup(file({ status: "missing" }));
    expect(missing.initial.title).toBe("growth");
    expect(resolveStartup(file({ status: "missing" }, { readonly: true })).readonly).toBe(true);
    expect(resolveStartup(file({ status: "missing" }, { sample: true })).initial).toEqual(
      createSampleDiagram(),
    );
    expect(resolveStartup(file({ status: "missing" }, { file: ".json" })).initial.title).toBe(
      "無題のシステム図",
    );
    expect(
      resolveStartup(file({ status: "invalid", revision: "r", errors: [] })).initialStatus,
    ).toEqual({
      kind: "suspended",
      reason: "unreadable",
    });
    expect(resolveStartup(file({ status: "error", error: "x" })).initialStatus).toEqual({
      kind: "suspended",
      reason: "unreadable",
    });
  });
});
