import { createEmptyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { setupEditor } from "../testing/editor.ts";
import type { AutosaveStatus } from "../persistence/autosave.ts";
import type { Startup } from "../persistence/startup.ts";
import type { DocumentStore, Opened, ReloadResult } from "../persistence/store.ts";
import { createNotices } from "./notices.ts";

let dispose = () => {};
afterEach(() => {
  dispose();
  vi.restoreAllMocks();
});

const startup = (opened: Opened, overrides: Partial<Startup> = {}): Startup => ({
  store: { label: "a.json" } as DocumentStore,
  opened,
  blank: createEmptyDiagram(),
  readonly: false,
  sessionInvalid: false,
  ...overrides,
});

const missing = startup({ status: "missing" });

function setup(target: Startup) {
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
  const notices = createNotices({ editor, startup: target, autosave: () => autosave, reloadPage });
  const shown = () => editor.notice.value;
  const run = (label: string) => {
    const action = shown()?.actions?.find((item) => item.label === label);
    if (!action) throw new Error(`no action ${label}`);
    action.run();
  };
  return { editor, notices, autosave, shown, run, exportFile, reloadPage };
}

describe("createNotices", () => {
  it("読み込めなかったら、その理由をもう一度知らせる", async () => {
    const file = setup(missing);
    file.autosave.reload.mockResolvedValueOnce({
      ok: false,
      problems: ["ファイルが削除されました"],
    });
    file.notices.explain({ kind: "suspended", reason: "external" });
    file.run("保存されている内容を読み込む");
    await vi.waitFor(() => expect(file.shown()?.details).toContain("ファイルが削除されました"));
  });

  it("つながりが切れたら、書き出しと再読み込みを勧める", () => {
    const file = setup(missing);
    file.notices.explain({ kind: "suspended", reason: "disconnected" });
    expect(file.shown()?.title).toBe("loopcraft serve との接続が切れました");
    expect(file.shown()?.details?.[2]).toContain("新しい URL");
    expect(file.shown()?.actions?.map((action) => action.label)).toEqual(["JSON を書き出す"]);
    file.run("JSON を書き出す");
    expect(file.exportFile).toHaveBeenCalledOnce();
  });

  it("状態が戻ったら、そのとき出していた案内だけを閉じる", () => {
    const file = setup(missing);
    file.notices.recovered();
    file.notices.explain({ kind: "suspended", reason: "disconnected" });
    expect(file.shown()?.title).toBe("loopcraft serve との接続が切れました");
    file.notices.recovered();
    expect(file.shown()).toBeNull();

    file.notices.explain({ kind: "suspended", reason: "disconnected" });
    file.editor.notify({ tone: "error", title: "別の問題" });
    file.notices.recovered();
    expect(file.shown()?.title).toBe("別の問題");
  });

  it("読み取り専用なら上書きを勧めない", () => {
    const viewer = setup(startup({ status: "unreadable", problems: [] }, { readonly: true }));
    viewer.notices.explain({ kind: "suspended", reason: "unreadable" });
    expect(viewer.shown()?.actions).toEqual([]);
    viewer.notices.explain({ kind: "suspended", reason: "external" });
    expect(viewer.shown()?.actions?.map((action) => action.label)).toEqual([
      "保存されている内容を読み込む",
    ]);
  });

  it("見張れなくなったことと、壊れたセッションを知らせる", () => {
    const file = setup(missing);
    file.notices.unwatched("ENOENT");
    expect(file.shown()?.details?.[0]).toBe("ENOENT");
    file.notices.unwatched(undefined);
    expect(file.shown()?.details).toHaveLength(1);
    dispose();

    const broken = setup(startup({ status: "missing" }, { sessionInvalid: true }));
    broken.notices.atStartup(undefined);
    expect(broken.shown()?.title).toBe("loopcraft serve の情報を読めませんでした");
    broken.run("ページを再読み込み");
    expect(broken.reloadPage).toHaveBeenCalledOnce();
  });

  it("保存できないときは、保存先の名前と理由を伝え、再試行するか書き出せる", () => {
    const failing: AutosaveStatus = { kind: "failing", error: new Error("quota") };
    const target = setup(missing);
    target.notices.explain(failing);
    expect(target.shown()?.title).toBe("自動保存できません");
    expect(target.shown()?.details?.slice(0, 2)).toEqual(["保存先: a.json", "Error: quota"]);
    target.run("JSON を書き出す");
    expect(target.exportFile).toHaveBeenCalledOnce();
    target.notices.explain(failing);
    target.run("再試行");
    expect(target.autosave.retry).toHaveBeenCalledOnce();
    expect(target.autosave.resume).not.toHaveBeenCalled();
  });

  it("ほかの場所での変更は、読み込むか上書きを選べる", () => {
    const external: AutosaveStatus = { kind: "suspended", reason: "external" };
    const target = setup(missing);
    target.notices.explain(external);
    expect(target.shown()?.title).toBe("図が外部で変更されました");
    target.run("保存されている内容を読み込む");
    expect(target.autosave.reload).toHaveBeenCalledOnce();
    target.notices.explain(external);
    target.run("この画面の内容で上書き");
    expect(target.autosave.resume).toHaveBeenCalledOnce();
  });

  it("開けなかった図は、理由を伝え、上書きを選べる", () => {
    const target = setup(startup({ status: "unreadable", problems: ["links.0.to: x"] }));
    target.notices.atStartup({ kind: "suspended", reason: "unreadable" });
    expect(target.shown()?.title).toBe("保存されていた図を開けませんでした");
    expect(target.shown()?.details?.[0]).toBe("保存先: a.json");
    expect(target.shown()?.details).toContain("links.0.to: x");
    expect(target.shown()?.actions?.map((action) => action.label)).toEqual([
      "この画面の内容で上書き",
    ]);
    target.run("この画面の内容で上書き");
    expect(target.autosave.resume).toHaveBeenCalledOnce();
  });

  it("開けなかった内容が手元にあれば、書き出せる", () => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const target = setup(startup({ status: "unreadable", problems: ["e"], raw: "{" }));
    target.notices.atStartup({ kind: "suspended", reason: "unreadable" });
    target.run("開けなかったデータを書き出す");
    expect(click).toHaveBeenCalledOnce();
  });

  it("開いた時点では、問題があるときだけ知らせる", () => {
    const fresh = setup(missing);
    fresh.notices.atStartup(undefined);
    expect(fresh.shown()).toBeNull();
    fresh.notices.reloaded();
    expect(fresh.shown()?.title).toBe("外部の変更を読み込みました");
    dispose();

    const fine = setup(startup({ status: "ok", diagram: createSampleDiagram() }));
    fine.notices.atStartup(undefined);
    fine.notices.explain({ kind: "ok" });
    expect(fine.shown()).toBeNull();
  });
});
