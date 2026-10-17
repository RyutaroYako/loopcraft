import { createSampleDiagram } from "@loopcraft/core/sample";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createBrowserStore } from "./store.ts";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("createBrowserStore", () => {
  it("localStorage に保存し、別のタブでの保存を知らせる", async () => {
    const store = createBrowserStore();
    expect(store.kind).toBe("browser");
    expect(await store.save(createSampleDiagram())).toEqual({ ok: true });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(await store.save(createSampleDiagram())).toMatchObject({ ok: false, reason: "failed" });
    const change = vi.fn();
    const stop = store.watch({ change, lost: vi.fn(), restored: vi.fn() });
    window.dispatchEvent(new StorageEvent("storage", { key: "loopcraft:document" }));
    stop();
    expect(change).toHaveBeenCalledOnce();
  });

  it("保存されている図を読み直し、読めなければ理由を返す", async () => {
    const store = createBrowserStore();
    expect(await store.reload()).toEqual({
      ok: false,
      problems: ["保存されていた図が消されました"],
    });
    await store.save(createSampleDiagram());
    expect(await store.reload()).toEqual({ ok: true, diagram: createSampleDiagram() });
    localStorage.setItem("loopcraft:document", "{");
    expect(await store.reload()).toMatchObject({
      ok: false,
      problems: expect.arrayContaining(["JSON ファイルではないか、内容が壊れています"]),
    });
  });
});
