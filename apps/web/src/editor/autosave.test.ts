import * as edit from "@loopcraft/core/edit";
import { createSampleDiagram } from "@loopcraft/core/sample";
import type { Diagram } from "@loopcraft/core/schema";
import { createRoot, flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { setupAutosave, type AutosaveStatus } from "./autosave.ts";
import { createEditor } from "./editor.ts";
import type { DocumentStore, SaveResult } from "./store.ts";

function fakeStore(kind: "browser" | "file" = "file") {
  let onChange: (() => void) | undefined;
  const store = {
    kind,
    label: "a.json",
    save: vi.fn(
      async (
        _diagram: Diagram,
        _options?: { force?: boolean; keepalive?: boolean },
      ): Promise<SaveResult> => ({ ok: true }),
    ),
    reload: vi.fn(async (): Promise<Diagram | undefined> => undefined),
    watch: vi.fn((listener: () => void) => {
      onChange = listener;
      return () => (onChange = undefined);
    }),
  } satisfies DocumentStore;
  return { store, change: () => onChange?.(), watching: () => onChange !== undefined };
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
  const result = createRoot((d) => {
    dispose = d;
    const editor = createEditor(createSampleDiagram());
    const autosave = setupAutosave(editor, store, { ...options, onProblem, onReload });
    return { editor, autosave };
  });
  flush();
  return { ...result, onProblem, onReload };
}

/** 保存の待ち時間を進め、保存の完了まで待つ */
async function settle() {
  flush();
  await vi.advanceTimersByTimeAsync(400);
  flush();
}

describe("setupAutosave", () => {
  it("開いただけでは保存せず、編集したら少し待って保存する", async () => {
    const { store } = fakeStore();
    const { editor, autosave } = setup(store);
    await settle();
    expect(store.save).not.toHaveBeenCalled();
    editor.commit(edit.setTitle(editor.current(), "変更"));
    await settle();
    expect(store.save).toHaveBeenCalledOnce();
    expect(store.save.mock.calls[0]![0].title).toBe("変更");
    expect(autosave.status()).toEqual({ kind: "ok" });
  });

  it("失敗したら一度だけ知らせ、成功したら戻す", async () => {
    const { store } = fakeStore();
    store.save.mockResolvedValue({ ok: false, reason: "failed", error: new Error("disk") });
    const { editor, autosave, onProblem } = setup(store);
    editor.commit(edit.setTitle(editor.current(), "1"));
    await settle();
    editor.commit(edit.setTitle(editor.current(), "2"));
    await settle();
    expect(autosave.status().kind).toBe("failing");
    expect(onProblem).toHaveBeenCalledOnce();
    store.save.mockResolvedValue({ ok: true });
    editor.commit(edit.setTitle(editor.current(), "3"));
    await settle();
    expect(autosave.status()).toEqual({ kind: "ok" });
  });

  it("競合したら保存を止め、再開するとこの画面の内容で上書きする", async () => {
    const { store } = fakeStore();
    store.save.mockResolvedValueOnce({ ok: false, reason: "conflict" });
    const { editor, autosave, onProblem } = setup(store);
    editor.commit(edit.setTitle(editor.current(), "1"));
    await settle();
    expect(autosave.status()).toEqual({ kind: "suspended", reason: "external" });
    expect(onProblem).toHaveBeenCalledWith({ kind: "suspended", reason: "external" });
    editor.commit(edit.setTitle(editor.current(), "2"));
    await settle();
    expect(store.save).toHaveBeenCalledOnce();
    await autosave.resume();
    flush();
    expect(store.save).toHaveBeenLastCalledWith(expect.objectContaining({ title: "2" }), {
      force: true,
      keepalive: false,
    });
    expect(autosave.status()).toEqual({ kind: "ok" });
  });

  it("止めた状態で始めたら、再開するまで保存しない", async () => {
    const { store } = fakeStore();
    const { editor, autosave } = setup(store, {
      initialStatus: { kind: "suspended", reason: "unreadable" },
    });
    editor.commit(edit.setTitle(editor.current(), "1"));
    await settle();
    expect(store.save).not.toHaveBeenCalled();
    await autosave.resume();
    expect(store.save).toHaveBeenCalledOnce();
  });

  it("未保存の変更が無ければ、外部の変更を取り込んで保存し直さない", async () => {
    const { store, change } = fakeStore();
    const latest = { ...createSampleDiagram(), title: "外部" };
    store.reload.mockResolvedValue(latest);
    const { editor, autosave, onReload } = setup(store);
    change();
    await settle();
    expect(editor.current()).toBe(latest);
    expect(onReload).toHaveBeenCalledOnce();
    expect(store.save).not.toHaveBeenCalled();
    expect(autosave.status()).toEqual({ kind: "ok" });
  });

  it("未保存の変更があるか、読み直せなければ保存を止める", async () => {
    const dirty = fakeStore();
    const first = setup(dirty.store);
    first.editor.commit(edit.setTitle(first.editor.current(), "1"));
    flush();
    dirty.change();
    await settle();
    expect(first.autosave.status()).toEqual({ kind: "suspended", reason: "external" });
    dirty.change();
    await settle();
    expect(first.onProblem).toHaveBeenCalledOnce();
    dispose();

    const browser = fakeStore("browser");
    const second = setup(browser.store);
    browser.change();
    await settle();
    expect(second.autosave.status()).toEqual({ kind: "suspended", reason: "external" });
    expect(await second.autosave.reload()).toBe(false);
  });

  it("保存中の変更は、その保存が終わってから改めて保存する", async () => {
    const { store } = fakeStore();
    let finish: (result: SaveResult) => void = () => {};
    store.save.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const { editor } = setup(store);
    editor.commit(edit.setTitle(editor.current(), "1"));
    await settle();
    editor.commit(edit.setTitle(editor.current(), "2"));
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
    editor.commit(edit.setTitle(editor.current(), "1"));
    flush();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(store.save).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.save).toHaveBeenCalledWith(expect.anything(), { force: false, keepalive: true });
    editor.commit(edit.setTitle(editor.current(), "2"));
    flush();
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.save).toHaveBeenCalledTimes(2);
    editor.commit(edit.setTitle(editor.current(), "3"));
    flush();
    dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.save).toHaveBeenCalledTimes(3);
    expect(watching()).toBe(false);
  });
});
