import { createSampleDiagram } from "@loopcraft/core/sample";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { setupEditor } from "../testing/editor.ts";
import type { AutosaveStatus } from "../persistence/autosave.ts";
import type { Startup } from "../persistence/startup.ts";
import type { DocumentStore, ReloadResult } from "../persistence/store.ts";
import { createNotices } from "./notices.ts";

let dispose = () => {};
afterEach(() => {
  dispose();
  vi.restoreAllMocks();
});

const browserStore = { label: "ブラウザ" } as DocumentStore;
const fileStore = { label: "a.json" } as DocumentStore;

function setup(store: DocumentStore, startup: Startup, readonly = false) {
  const { editor, dispose: d } = setupEditor();
  dispose = d;
  const autosave = {
    retry: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    reload: vi.fn(async (): Promise<ReloadResult> => ({
      ok: true,
      diagram: createSampleDiagram(),
    })),
  };
  const exportFile = vi.spyOn(editor, "exportFile").mockImplementation(() => {});
  const reloadPage = vi.fn();
  const notices = createNotices({
    editor,
    store,
    startup,
    readonly,
    autosave: () => autosave,
    reloadPage,
  });
  const shown = () => editor.notice.value;
  const run = (label: string) => {
    const action = shown()?.actions?.find((item) => item.label === label);
    if (!action) throw new Error(`no action ${label}`);
    action.run();
  };
  return { editor, notices, autosave, shown, run, exportFile, reloadPage };
}

const browserStartup: Startup = { kind: "browser", stored: { status: "empty" } };
const fileStartup = (loaded: Extract<Startup, { kind: "file" }>["loaded"]): Startup => ({
  kind: "file",
  session: { token: "t", file: "a.json", readonly: false },
  loaded,
  store: fileStore,
});

describe("createNotices", () => {
  it("読み込めなかったら、その理由をもう一度知らせる", async () => {
    const file = setup(fileStore, fileStartup({ status: "missing" }));
    file.autosave.reload.mockResolvedValueOnce({
      ok: false,
      problems: ["ファイルが削除されました"],
    });
    file.notices.explain({ kind: "suspended", reason: "external" });
    file.run("保存されている内容を読み込む");
    await vi.waitFor(() => expect(file.shown()?.details).toContain("ファイルが削除されました"));
  });

  it("つながりが切れたら、書き出しと再読み込みを勧める", () => {
    const file = setup(fileStore, fileStartup({ status: "missing" }));
    file.notices.explain({ kind: "suspended", reason: "disconnected" });
    expect(file.shown()?.title).toBe("loopcraft serve とのつながりが切れました");
    expect(file.shown()?.details?.[1]).toContain("新しい URL");
    expect(file.shown()?.actions?.map((action) => action.label)).toEqual(["JSON を書き出す"]);
    file.run("JSON を書き出す");
    expect(file.exportFile).toHaveBeenCalledOnce();
  });

  it("状態が戻ったら、そのとき出していた案内だけを閉じる", () => {
    const file = setup(fileStore, fileStartup({ status: "missing" }));
    file.notices.recovered();
    file.notices.explain({ kind: "suspended", reason: "disconnected" });
    expect(file.shown()?.title).toBe("loopcraft serve とのつながりが切れました");
    file.notices.recovered();
    expect(file.shown()).toBeNull();

    file.notices.explain({ kind: "suspended", reason: "disconnected" });
    file.editor.notify({ tone: "error", title: "別の問題" });
    file.notices.recovered();
    expect(file.shown()?.title).toBe("別の問題");
  });

  it("読み取り専用なら上書きを勧めない", () => {
    const viewer = setup(
      fileStore,
      fileStartup({ status: "invalid", revision: "r", errors: [] }),
      true,
    );
    viewer.notices.explain({ kind: "suspended", reason: "unreadable" });
    expect(viewer.shown()?.actions).toEqual([]);
    viewer.notices.explain({ kind: "suspended", reason: "external" });
    expect(viewer.shown()?.actions?.map((action) => action.label)).toEqual([
      "保存されている内容を読み込む",
    ]);
  });

  it("見張れなくなったことと、壊れたセッションを知らせる", () => {
    const file = setup(fileStore, fileStartup({ status: "missing" }));
    file.notices.unwatched("ENOENT");
    expect(file.shown()?.details?.[0]).toBe("ENOENT");
    file.notices.unwatched(undefined);
    expect(file.shown()?.details).toHaveLength(2);
    dispose();

    const broken = setup(browserStore, {
      kind: "browser",
      stored: { status: "empty" },
      sessionInvalid: true,
    });
    broken.notices.atStartup(undefined);
    expect(broken.shown()?.title).toBe("loopcraft serve の情報を読めませんでした");
    broken.run("ページを再読み込み");
    expect(broken.reloadPage).toHaveBeenCalledOnce();
  });

  it("保存できないときは、保存先の名前と理由を伝え、保存し直すか書き出せる", () => {
    const failing: AutosaveStatus = { kind: "failing", error: new Error("quota") };
    const browser = setup(browserStore, browserStartup);
    browser.notices.explain(failing);
    expect(browser.shown()?.title).toBe("自動保存できません");
    expect(browser.shown()?.details?.slice(0, 2)).toEqual(["保存先: ブラウザ", "Error: quota"]);
    browser.run("JSON を書き出す");
    expect(browser.exportFile).toHaveBeenCalledOnce();
    browser.notices.explain(failing);
    browser.run("保存し直す");
    expect(browser.autosave.retry).toHaveBeenCalledOnce();
    expect(browser.autosave.resume).not.toHaveBeenCalled();
  });

  it("ほかの場所での変更は、保存先によらず読み込むか上書きを選べる", () => {
    const external: AutosaveStatus = { kind: "suspended", reason: "external" };
    for (const [store, startup] of [
      [browserStore, browserStartup],
      [fileStore, fileStartup({ status: "missing" })],
    ] as const) {
      const target = setup(store, startup);
      target.notices.explain(external);
      expect(target.shown()?.title).toBe("ほかの場所で図が変更されました");
      target.run("保存されている内容を読み込む");
      expect(target.autosave.reload).toHaveBeenCalledOnce();
      target.notices.explain(external);
      target.run("この画面の内容で上書き");
      expect(target.autosave.resume).toHaveBeenCalledOnce();
      dispose();
    }
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

    const error = setup(fileStore, fileStartup({ status: "error", error: "HTTP 500" }));
    error.notices.explain({ kind: "suspended", reason: "unreadable" });
    expect(error.shown()?.details?.at(-1)).toBe("HTTP 500");
  });

  it("開けなかったブラウザのデータは、書き出すか上書きを選べる", () => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const startup: Startup = {
      kind: "browser",
      stored: { status: "invalid", raw: "{", errors: ["e"] },
    };
    const browser = setup(browserStore, startup);
    browser.notices.atStartup({ kind: "suspended", reason: "unreadable" });
    expect(browser.shown()?.title).toBe("前回の図を開けませんでした");
    expect(browser.shown()?.details).toContain("e");
    browser.run("開けなかったデータを書き出す");
    expect(click).toHaveBeenCalledOnce();
    browser.run("この画面の内容で上書き");
    expect(browser.autosave.resume).toHaveBeenCalledOnce();
  });

  it("開いた時点の案内", () => {
    const missing = setup(fileStore, fileStartup({ status: "missing" }));
    missing.notices.atStartup(undefined);
    expect(missing.shown()).toMatchObject({ tone: "info", title: "a.json はまだありません" });
    missing.notices.reloaded();
    expect(missing.shown()?.title).toBe("ほかの場所での変更を読み込みました");
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
