import { createSampleDiagram } from "@loopcraft/core/sample";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createBrowserStore } from "./store.ts";

afterEach(() => vi.restoreAllMocks());

describe("createBrowserStore", () => {
  it("localStorage に保存し、読み直しはしない", async () => {
    const store = createBrowserStore();
    expect(store.kind).toBe("browser");
    expect(await store.save(createSampleDiagram())).toEqual({ ok: true });
    expect(await store.reload()).toBeUndefined();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(await store.save(createSampleDiagram())).toMatchObject({ ok: false, reason: "failed" });
    const stop = store.watch(() => {});
    stop();
  });
});
