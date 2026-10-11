import { stringifyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  listBackups,
  loadStoredDiagram,
  readBackup,
  removeBackup,
  storeDiagram,
  watchOtherTabs,
} from "./storage.ts";

const KEY = "loopcraft:document";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("storage", () => {
  it("保存した図を読み直す", () => {
    expect(loadStoredDiagram()).toEqual({ status: "empty" });
    expect(storeDiagram(createSampleDiagram())).toEqual({ ok: true });
    expect(loadStoredDiagram()).toMatchObject({ status: "ok" });
  });

  it("読めない図は退避し、同じ内容なら退避を増やさない", () => {
    localStorage.setItem(KEY, "{");
    const first = loadStoredDiagram();
    expect(first).toMatchObject({ status: "invalid", raw: "{" });
    const second = loadStoredDiagram();
    expect(second.status === "invalid" && second.backupKey).toBe(
      first.status === "invalid" && first.backupKey,
    );
    expect(listBackups()).toHaveLength(1);
  });

  it("退避できなければ backupKey が無い", () => {
    localStorage.setItem(KEY, "{");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(loadStoredDiagram()).toMatchObject({ status: "invalid", backupKey: undefined });
    expect(storeDiagram(createSampleDiagram())).toMatchObject({ ok: false });
  });

  it("localStorage が使えなければ unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(loadStoredDiagram()).toMatchObject({ status: "unavailable" });
    expect(readBackup("x")).toBeUndefined();
  });

  it("退避したデータを新しい順に並べ、読み、消す", () => {
    localStorage.setItem(`${KEY}:backup:100`, "old");
    localStorage.setItem(`${KEY}:backup:200`, "new");
    localStorage.setItem("other", "x");
    const backups = listBackups();
    expect(backups.map((backup) => backup.key)).toEqual([`${KEY}:backup:200`, `${KEY}:backup:100`]);
    expect(readBackup(`${KEY}:backup:100`)).toBe("old");
    expect(readBackup("none")).toBeUndefined();
    removeBackup(`${KEY}:backup:100`);
    expect(listBackups()).toHaveLength(1);
  });

  it("一覧や削除で storage が使えなくても落ちない", () => {
    vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(listBackups()).toEqual([]);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => removeBackup("x")).not.toThrow();
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
