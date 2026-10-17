import { createSampleDiagram } from "@loopcraft/core/sample";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { downloadDiagram, pickJsonFile } from "./file.ts";

const revoke = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  revoke.mockClear();
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = revoke;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("downloadDiagram", () => {
  it("タイトルをファイル名にして書き出し、少し待ってから URL を解放する", () => {
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    downloadDiagram({ ...createSampleDiagram(), title: ' 成長/負荷:"図" ' });
    downloadDiagram({ ...createSampleDiagram(), title: "   " });
    expect(names).toEqual(["成長_負荷_図_.json", "system-diagram.json"]);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});

describe("pickJsonFile", () => {
  it("選ばれたファイルを返し、キャンセルなら undefined", async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    const lastInput = () => click.mock.contexts.at(-1) as HTMLInputElement;
    const chosen = pickJsonFile();
    const file = new File(["{}"], "a.json");
    Object.defineProperty(lastInput(), "files", { value: [file] });
    lastInput().dispatchEvent(new Event("change"));
    expect(await chosen).toBe(file);

    const cancelled = pickJsonFile();
    lastInput().dispatchEvent(new Event("cancel"));
    expect(await cancelled).toBeUndefined();
  });
});
