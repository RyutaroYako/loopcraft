import { stringifyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { loadStoredDiagram, storeDiagram, watchOtherTabs } from "./storage.ts";

const KEY = "loopcraft:document";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("storage", () => {
  it("保存した図を読み直す", () => {
    expect(loadStoredDiagram()).toEqual({ status: "missing" });
    expect(storeDiagram(createSampleDiagram())).toEqual({ ok: true });
    expect(loadStoredDiagram()).toMatchObject({ status: "ok" });
  });

  it("読めない図は、元の文字列と理由を返し、保存先には触らない", () => {
    localStorage.setItem(KEY, "{");
    expect(loadStoredDiagram()).toMatchObject({ status: "unreadable", raw: "{" });
    expect([...Array(localStorage.length).keys()].map((index) => localStorage.key(index))).toEqual([
      KEY,
    ]);
    expect(localStorage.getItem(KEY)).toBe("{");
  });

  it("書き込めなければ失敗を返す", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(storeDiagram(createSampleDiagram())).toMatchObject({ ok: false });
  });

  it("localStorage が使えなければ、その理由で開けなかったとする", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(loadStoredDiagram()).toEqual({
      status: "unreadable",
      problems: ["Error: SecurityError"],
    });
  });

  it("別のタブでの保存だけを知らせる", () => {
    const listener = vi.fn();
    const stop = watchOtherTabs(listener);
    window.dispatchEvent(new StorageEvent("storage", { key: "other" }));
    window.dispatchEvent(
      new StorageEvent("storage", { key: KEY, newValue: stringifyDiagram(createSampleDiagram()) }),
    );
    stop();
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    expect(listener).toHaveBeenCalledOnce();
  });
});
