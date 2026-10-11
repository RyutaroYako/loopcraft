import { createSampleDiagram } from "@loopcraft/core/sample";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { setupEditor } from "../testing/editor.ts";
import type { AutosaveStatus } from "./autosave.ts";
import { createNotices } from "./notices.ts";
import type { Startup } from "./startup.ts";
import type { DocumentStore } from "./store.ts";

let dispose = () => {};
afterEach(() => {
  dispose();
  vi.restoreAllMocks();
});

const browserStore = { kind: "browser", label: "ブラウザ" } as DocumentStore;
const fileStore = { kind: "file", label: "a.json" } as DocumentStore;

function setup(store: DocumentStore, startup: Startup) {
  const { editor, dispose: d } = setupEditor();
  dispose = d;
  const autosave = { resume: vi.fn(async () => {}), reload: vi.fn(async () => true) };
  const exportFile = vi.spyOn(editor, "exportFile").mockImplementation(() => {});
  const notices = createNotices({ editor, store, startup, autosave: () => autosave });
  const shown = () => {
    flush();
    return editor.notice();
  };
  const run = (label: string) => {
    const action = shown()?.actions?.find((item) => item.label === label);
    if (!action) throw new Error(`no action ${label}`);
    action.run();
  };
  return { editor, notices, autosave, shown, run, exportFile };
}

const browserStartup: Startup = { kind: "browser", stored: { status: "empty" } };
const fileStartup = (loaded: Extract<Startup, { kind: "file" }>["loaded"]): Startup => ({
  kind: "file",
  session: { token: "t", file: "a.json", editable: true, readonly: false },
  loaded,
  store: fileStore,
});

describe("createNotices", () => {
  it("保存できないときは、保存先に応じて伝える", () => {
    const failing: AutosaveStatus = { kind: "failing", error: new Error("quota") };
    const browser = setup(browserStore, browserStartup);
    browser.notices.explain(failing);
    expect(browser.shown()?.title).toBe("ブラウザに自動保存できません");
    browser.run("JSON を書き出す");
    expect(browser.exportFile).toHaveBeenCalledOnce();
    dispose();

    const file = setup(fileStore, fileStartup({ status: "missing" }));
    file.notices.explain(failing);
    expect(file.shown()?.title).toBe("a.json に保存できません");
    file.run("保存し直す");
    expect(file.autosave.resume).toHaveBeenCalledOnce();
  });

  it("外部での変更は、ブラウザなら保存し直し、ファイルなら読み込むか上書きを選べる", () => {
    const external: AutosaveStatus = { kind: "suspended", reason: "external" };
    const browser = setup(browserStore, browserStartup);
    browser.notices.explain(external);
    expect(browser.shown()?.title).toBe("別のタブでこの図が保存されました");
    browser.run("このタブの内容で保存し直す");
    expect(browser.autosave.resume).toHaveBeenCalledOnce();
    dispose();

    const file = setup(fileStore, fileStartup({ status: "missing" }));
    file.notices.explain(external);
    expect(file.shown()?.title).toBe("a.json がほかの場所で変更されました");
    file.run("ファイルの内容を読み込む");
    expect(file.autosave.reload).toHaveBeenCalledOnce();
    file.notices.explain(external);
    file.run("この画面の内容で上書き");
    expect(file.autosave.resume).toHaveBeenCalledOnce();
  });

  it("開けなかったファイルは、直すか上書きを選べる", () => {
    const file = setup(
      fileStore,
      fileStartup({ status: "invalid", revision: "r", errors: ["links.0.to: x"] }),
    );
    file.notices.atStartup({ kind: "suspended", reason: "unreadable" });
    expect(file.shown()?.details).toContain("links.0.to: x");
    file.run("この画面の内容で上書き");
    expect(file.autosave.resume).toHaveBeenCalledOnce();
    dispose();

    const error = setup(fileStore, fileStartup({ status: "error", error: "x" }));
    error.notices.explain({ kind: "suspended", reason: "unreadable" });
    expect(error.shown()?.details).toHaveLength(1);
  });

  it("ブラウザで退避できなかったデータは、書き出してから再開する", () => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const startup: Startup = {
      kind: "browser",
      stored: { status: "invalid", raw: "{", errors: ["e"], backupKey: undefined },
    };
    const browser = setup(browserStore, startup);
    browser.notices.atStartup({ kind: "suspended", reason: "unreadable" });
    expect(browser.shown()?.title).toBe("自動保存を止めています");
    browser.run("開けなかったデータを書き出す");
    expect(click).toHaveBeenCalledOnce();
    browser.run("書き出したので自動保存を再開");
    expect(browser.autosave.resume).toHaveBeenCalledOnce();
    dispose();

    const plain = setup(browserStore, browserStartup);
    plain.notices.explain({ kind: "suspended", reason: "unreadable" });
    expect(plain.shown()?.actions?.map((action) => action.label)).toEqual([
      "書き出したので自動保存を再開",
    ]);
  });

  it("開いた時点の案内", () => {
    const backedUp = setup(browserStore, {
      kind: "browser",
      stored: { status: "invalid", raw: "{", errors: ["e"], backupKey: "k" },
    });
    backedUp.notices.atStartup(undefined);
    expect(backedUp.shown()?.title).toBe("前回の図を開けませんでした");
    dispose();

    const missing = setup(fileStore, fileStartup({ status: "missing" }));
    missing.notices.atStartup(undefined);
    expect(missing.shown()).toMatchObject({ tone: "info", title: "a.json はまだありません" });
    missing.notices.reloaded();
    expect(missing.shown()?.title).toBe("a.json の変更を読み込みました");
    dispose();

    const fine = setup(
      fileStore,
      fileStartup({ status: "ok", diagram: createSampleDiagram(), revision: "r" }),
    );
    fine.notices.atStartup(undefined);
    fine.notices.explain({ kind: "ok" });
    expect(fine.shown()).toBeNull();
  });
});
