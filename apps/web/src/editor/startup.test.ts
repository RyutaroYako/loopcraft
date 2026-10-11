import { stringifyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { prepareStartup, resolveStartup, type Startup } from "./startup.ts";
import type { DocumentStore } from "./store.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const session = { token: "t", file: "dir/growth.json", editable: false, readonly: false };
const store = { kind: "file", label: "growth.json" } as DocumentStore;

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
      editable: true,
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
    const invalid = (backupKey: string | undefined): Startup => ({
      kind: "browser",
      stored: { status: "invalid", raw: "{", errors: [], backupKey },
    });
    expect(resolveStartup(invalid(undefined)).initialStatus).toEqual({
      kind: "suspended",
      reason: "unreadable",
    });
    expect(resolveStartup(invalid("k")).initialStatus).toBeUndefined();
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
      editable: false,
      store,
    });
    const missing = resolveStartup(file({ status: "missing" }, { editable: true }));
    expect(missing.initial.title).toBe("growth");
    expect(missing.editable).toBe(true);
    expect(
      resolveStartup(file({ status: "missing" }, { editable: true, readonly: true })).editable,
    ).toBe(false);
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
      kind: "failing",
      error: "x",
    });
  });
});
