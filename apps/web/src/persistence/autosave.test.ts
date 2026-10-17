import * as edit from "@loopcraft/core/edit";
import { createSampleDiagram } from "@loopcraft/core/sample";
import type { Diagram } from "@loopcraft/core/schema";
import { effectScope } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useEditor } from "../editor/useEditor.ts";
import type { AutosaveStatus } from "./autosave.ts";
import type { DocumentStore, ReloadResult, SaveResult, WatchHandlers } from "./store.ts";
import { useAutosave } from "./useAutosave.ts";

function fakeStore() {
  let handlers: WatchHandlers | undefined;
  const store = {
    label: "a.json",
    save: vi.fn(
      async (
        _diagram: Diagram,
        _options?: { force?: boolean; keepalive?: boolean },
      ): Promise<SaveResult> => ({ ok: true }),
    ),
    reload: vi.fn(async (): Promise<ReloadResult> => ({ ok: false, problems: [] })),
    watch: vi.fn((next: WatchHandlers) => {
      handlers = next;
      return () => (handlers = undefined);
    }),
  } satisfies DocumentStore;
  return {
    store,
    change: () => handlers?.change(),
    lose: (reason: "disconnected" | "unwatched", detail?: string) => handlers?.lost(reason, detail),
    restore: () => handlers?.restored(),
    watching: () => handlers !== undefined,
  };
}

let dispose = () => {};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  dispose();
  vi.useRealTimers();
});

function setup(store: DocumentStore, options: { initialStatus?: AutosaveStatus } = {}) {
  const onProblem = vi.fn();
  const onReload = vi.fn();
  const onUnwatched = vi.fn();
  const onRecovered = vi.fn();
  const scope = effectScope();
  const result = scope.run(() => {
    const editor = useEditor(createSampleDiagram());
    const autosave = useAutosave(editor, store, {
      ...options,
      onProblem,
      onReload,
      onUnwatched,
      onRecovered,
    });
    return { editor, autosave };
  })!;
  const stop = result.autosave.start();
  dispose = () => {
    stop();
    scope.stop();
  };
  return { ...result, onProblem, onReload, onUnwatched, onRecovered };
}

async function settle() {
  await vi.advanceTimersByTimeAsync(400);
}

describe("useAutosave", () => {
  it("開いただけでは保存せず、編集したら少し待って保存する", async () => {
    const { store } = fakeStore();
    const { editor, autosave } = setup(store);
    await settle();
    expect(store.save).not.toHaveBeenCalled();
    editor.commit(edit.setTitle(editor.diagram.value, "変更"));
    await settle();
    expect(store.save).toHaveBeenCalledOnce();
    expect(store.save.mock.calls[0]![0].title).toBe("変更");
    expect(autosave.status.value).toEqual({ kind: "ok" });
  });

  it("失敗したら一度だけ知らせ、成功したら戻す", async () => {
    const { store } = fakeStore();
    store.save.mockResolvedValue({ ok: false, reason: "failed", error: new Error("disk") });
    const { editor, autosave, onProblem } = setup(store);
    editor.commit(edit.setTitle(editor.diagram.value, "1"));
    await settle();
    editor.commit(edit.setTitle(editor.diagram.value, "2"));
    await settle();
    expect(autosave.status.value.kind).toBe("failing");
    expect(onProblem).toHaveBeenCalledOnce();
    store.save.mockResolvedValue({ ok: true });
    editor.commit(edit.setTitle(editor.diagram.value, "3"));
    await settle();
    expect(autosave.status.value).toEqual({ kind: "ok" });
  });

  it("競合したら保存を止め、再開するとこの画面の内容で上書きする", async () => {
    const { store } = fakeStore();
    store.save.mockResolvedValueOnce({ ok: false, reason: "conflict" });
    const { editor, autosave, onProblem } = setup(store);
    editor.commit(edit.setTitle(editor.diagram.value, "1"));
    await settle();
    expect(autosave.status.value).toEqual({ kind: "suspended", reason: "external" });
    expect(onProblem).toHaveBeenCalledWith({ kind: "suspended", reason: "external" });
    editor.commit(edit.setTitle(editor.diagram.value, "2"));
    await settle();
    expect(store.save).toHaveBeenCalledOnce();
    await autosave.resume();
    expect(store.save).toHaveBeenLastCalledWith(expect.objectContaining({ title: "2" }), {
      force: true,
      keepalive: false,
    });
    expect(autosave.status.value).toEqual({ kind: "ok" });
  });

  it("止めた状態で始めたら、再開するまで保存しない", async () => {
    const { store } = fakeStore();
    const { editor, autosave } = setup(store, {
      initialStatus: { kind: "suspended", reason: "unreadable" },
    });
    editor.commit(edit.setTitle(editor.diagram.value, "1"));
    await settle();
    expect(store.save).not.toHaveBeenCalled();
    await autosave.resume();
    expect(store.save).toHaveBeenCalledOnce();
  });

  it("未保存の変更が無ければ、外部の変更を取り込んで保存し直さない", async () => {
    const { store, change } = fakeStore();
    const latest = { ...createSampleDiagram(), title: "外部" };
    store.reload.mockResolvedValue({ ok: true, diagram: latest });
    const { editor, autosave, onReload } = setup(store);
    change();
    await settle();
    expect(editor.diagram.value).toBe(latest);
    expect(onReload).toHaveBeenCalledOnce();
    expect(store.save).not.toHaveBeenCalled();
    expect(autosave.status.value).toEqual({ kind: "ok" });
  });

  it("未保存の変更があるか、読み直せなければ保存を止める", async () => {
    const dirty = fakeStore();
    const first = setup(dirty.store);
    first.editor.commit(edit.setTitle(first.editor.diagram.value, "1"));
    dirty.change();
    await settle();
    expect(first.autosave.status.value).toEqual({ kind: "suspended", reason: "external" });
    dirty.change();
    await settle();
    expect(first.onProblem).toHaveBeenCalledOnce();
    dispose();

    const unreadable = fakeStore();
    unreadable.store.reload.mockResolvedValue({ ok: false, problems: ["壊れています"] });
    const second = setup(unreadable.store);
    unreadable.change();
    await settle();
    expect(second.autosave.status.value).toEqual({
      kind: "suspended",
      reason: "external",
      problems: ["壊れています"],
    });
    expect(await second.autosave.reload()).toEqual({ ok: false, problems: ["壊れています"] });
  });

  it("保存中の変更は、その保存が終わってから改めて保存する", async () => {
    const { store } = fakeStore();
    let finish: (result: SaveResult) => void = () => {};
    store.save.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const { editor } = setup(store);
    editor.commit(edit.setTitle(editor.diagram.value, "1"));
    await settle();
    editor.commit(edit.setTitle(editor.diagram.value, "2"));
    await settle();
    expect(store.save).toHaveBeenCalledOnce();
    finish({ ok: true });
    await settle();
    expect(store.save).toHaveBeenCalledTimes(2);
    expect(store.save.mock.calls[1]![0].title).toBe("2");
  });

  it("タブを隠す・閉じるときは待たずに保存し、閉じたら購読をやめる", async () => {
    const { store, watching } = fakeStore();
    const { editor } = setup(store);
    expect(watching()).toBe(true);
    editor.commit(edit.setTitle(editor.diagram.value, "1"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(store.save).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.save).toHaveBeenCalledWith(expect.anything(), { force: false, keepalive: true });
    editor.commit(edit.setTitle(editor.diagram.value, "2"));
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.save).toHaveBeenCalledTimes(2);
    editor.commit(edit.setTitle(editor.diagram.value, "3"));
    dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.save).toHaveBeenCalledTimes(3);
    expect(watching()).toBe(false);
  });

  it("保存し直しは上書きせず、外部での変更があれば競合として止める", async () => {
    const { store } = fakeStore();
    store.save
      .mockResolvedValueOnce({ ok: false, reason: "failed", error: "x" })
      .mockResolvedValueOnce({ ok: false, reason: "conflict" });
    const { editor, autosave } = setup(store);
    editor.commit(edit.setTitle(editor.diagram.value, "1"));
    await settle();
    expect(autosave.status.value.kind).toBe("failing");
    await autosave.retry();
    expect(store.save).toHaveBeenLastCalledWith(expect.anything(), {
      force: false,
      keepalive: false,
    });
    expect(autosave.status.value).toEqual({ kind: "suspended", reason: "external" });
  });

  it("つながりが切れたら保存を止め、見張れなくなっただけなら知らせて続ける", async () => {
    const { store, lose } = fakeStore();
    const { editor, autosave, onProblem, onUnwatched } = setup(store);
    lose("unwatched", "ENOENT");
    expect(onUnwatched).toHaveBeenCalledWith("ENOENT");
    expect(autosave.status.value).toEqual({ kind: "ok" });
    expect(autosave.unwatched.value).toBe("ENOENT");
    lose("disconnected");
    expect(autosave.status.value).toEqual({ kind: "suspended", reason: "disconnected" });
    expect(onProblem).toHaveBeenCalledOnce();
    editor.commit(edit.setTitle(editor.diagram.value, "1"));
    await settle();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("保存でつながりが切れていると分かったら止める", async () => {
    const { store } = fakeStore();
    store.save.mockResolvedValueOnce({ ok: false, reason: "disconnected" });
    const { editor, autosave, onProblem } = setup(store, {
      initialStatus: { kind: "suspended", reason: "unreadable" },
    });
    await autosave.resume();
    expect(autosave.status.value).toEqual({ kind: "suspended", reason: "disconnected" });
    expect(onProblem).toHaveBeenCalledWith({ kind: "suspended", reason: "disconnected" });
    editor.commit(edit.setTitle(editor.diagram.value, "x"));
  });

  it("取り込めなかったときは、その理由を状態に残す", async () => {
    const { store, change } = fakeStore();
    store.reload.mockResolvedValue({ ok: false, problems: ["ファイルが削除されました"] });
    const { autosave, onProblem } = setup(store);
    change();
    await settle();
    expect(autosave.status.value).toEqual({
      kind: "suspended",
      reason: "external",
      problems: ["ファイルが削除されました"],
    });
    expect(onProblem).toHaveBeenCalledOnce();
  });

  it("つながりが戻ったら、溜まっていた変更を保存し直す", async () => {
    const { store, lose, restore } = fakeStore();
    const { editor, autosave, onRecovered } = setup(store);
    restore();
    lose("disconnected");
    editor.commit(edit.setTitle(editor.diagram.value, "1"));
    await settle();
    expect(store.save).not.toHaveBeenCalled();
    restore();
    await settle();
    expect(autosave.status.value).toEqual({ kind: "ok" });
    expect(onRecovered).toHaveBeenCalledOnce();
    expect(store.save).toHaveBeenCalledOnce();
    lose("disconnected");
    restore();
    await settle();
    expect(store.save).toHaveBeenCalledOnce();
  });

  it("つながりが戻っても、切れる前に止めていた理由は残し、上書きしない", async () => {
    const { store, lose, restore } = fakeStore();
    const { editor, autosave, onProblem } = setup(store, {
      initialStatus: { kind: "suspended", reason: "unreadable" },
    });
    editor.commit(edit.setTitle(editor.diagram.value, "1"));
    await settle();
    lose("disconnected");
    lose("disconnected");
    restore();
    await settle();
    expect(autosave.status.value).toEqual({ kind: "suspended", reason: "unreadable" });
    expect(onProblem).toHaveBeenLastCalledWith({ kind: "suspended", reason: "unreadable" });
    expect(store.save).not.toHaveBeenCalled();
  });

  it("取り込めずに止めていても、守る変更が無ければ直したファイルを取り込む", async () => {
    const { store, change } = fakeStore();
    store.reload.mockResolvedValueOnce({ ok: false, problems: ["壊れています"] });
    const { editor, autosave } = setup(store);
    change();
    await settle();
    expect(autosave.status.value).toMatchObject({ kind: "suspended", reason: "external" });
    const fixed = { ...createSampleDiagram(), title: "直した" };
    store.reload.mockResolvedValueOnce({ ok: true, diagram: fixed });
    change();
    await settle();
    expect(editor.diagram.value).toBe(fixed);
    expect(autosave.status.value).toEqual({ kind: "ok" });
  });

  it("中身が変わっていなければ取り込まず、履歴も増やさない", async () => {
    const { store, change } = fakeStore();
    const { editor, onReload } = setup(store);
    store.reload.mockResolvedValueOnce({
      ok: true,
      diagram: structuredClone(editor.diagram.value),
    });
    const before = editor.diagram.value;
    change();
    await settle();
    expect(editor.diagram.value).toBe(before);
    expect(editor.historySize.value.undo).toBe(0);
    expect(onReload).not.toHaveBeenCalled();
  });

  it("読み直している間に編集されたら、取り込まずに競合として止める", async () => {
    const { store, change } = fakeStore();
    let finish: (result: ReloadResult) => void = () => {};
    store.reload.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const { editor, autosave } = setup(store);
    change();
    editor.commit(edit.setTitle(editor.diagram.value, "読み直し中の編集"));
    finish({ ok: true, diagram: { ...createSampleDiagram(), title: "外部" } });
    await settle();
    expect(editor.diagram.value.title).toBe("読み直し中の編集");
    expect(autosave.status.value).toEqual({ kind: "suspended", reason: "external" });
  });

  it("未保存の変更があるまま閉じようとしたら確かめる", async () => {
    const { store } = fakeStore();
    const { editor } = setup(store);
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    editor.commit(edit.setTitle(editor.diagram.value, "1"));
    const pending = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(pending);
    expect(pending.defaultPrevented).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.save).toHaveBeenCalledWith(expect.anything(), { force: false, keepalive: true });
  });
});
