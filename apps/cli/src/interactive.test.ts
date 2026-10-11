import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createWorkspace } from "./testing/fixtures.ts";

const CANCEL = Symbol("cancel");
const prompts = vi.hoisted(() => ({
  select: vi.fn(),
  multiselect: vi.fn(),
  text: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  ...prompts,
  isCancel: (value: unknown) => typeof value === "symbol",
}));

const { clackPrompts, COMMANDS } = await import("./interactive.ts");

beforeEach(() => {
  for (const mock of Object.values(prompts)) mock.mockReset();
});

async function withFiles(...names: string[]) {
  const { cwd } = await createWorkspace();
  for (const name of names) await writeFile(join(cwd, name), "{}");
  return cwd;
}

describe("clackPrompts", () => {
  it("コマンドを選ぶ", async () => {
    prompts.select.mockResolvedValueOnce("loops").mockResolvedValueOnce(CANCEL);
    expect(await clackPrompts.chooseCommand()).toBe("loops");
    expect(await clackPrompts.chooseCommand()).toBeUndefined();
    expect(prompts.select.mock.calls[0]![0]).toMatchObject({ options: COMMANDS });
  });

  it("既存のファイルを選ぶか、新しいファイル名を入力する", async () => {
    const cwd = await withFiles("a.json");
    prompts.select.mockResolvedValueOnce("a.json");
    expect(await clackPrompts.chooseFile(cwd, { message: "m", allowNew: true })).toBe("a.json");

    prompts.select.mockResolvedValueOnce("\u0000new-file");
    prompts.text.mockResolvedValueOnce("new.json");
    expect(await clackPrompts.chooseFile(cwd, { message: "m", allowNew: true })).toBe("new.json");
    const validate = (prompts.text.mock.calls[0]![0] as { validate: (v: string) => unknown })
      .validate;
    expect(validate("x.txt")).toBeTruthy();
    expect(validate("x.json")).toBeUndefined();

    prompts.select.mockResolvedValueOnce(CANCEL);
    expect(await clackPrompts.chooseFile(cwd, { message: "m", allowNew: true })).toBeUndefined();

    prompts.select.mockResolvedValueOnce("\u0000new-file");
    prompts.text.mockResolvedValueOnce(CANCEL);
    expect(await clackPrompts.chooseFile(cwd, { message: "m", allowNew: true })).toBeUndefined();
  });

  it("JSON が無ければ、新規なら名前だけを聞き、そうでなければ何も聞かない", async () => {
    const cwd = await withFiles();
    prompts.text.mockResolvedValueOnce("first.json");
    expect(await clackPrompts.chooseFile(cwd, { message: "m", allowNew: true })).toBe("first.json");
    expect(prompts.select).not.toHaveBeenCalled();
    expect(await clackPrompts.chooseFile(cwd, { message: "m", allowNew: false })).toBeUndefined();
  });

  it("検証するファイルをまとめて選ぶ", async () => {
    expect(await clackPrompts.chooseFiles(await withFiles())).toEqual([]);
    const cwd = await withFiles("a.json", "b.json");
    prompts.multiselect.mockResolvedValueOnce(["a.json"]).mockResolvedValueOnce(CANCEL);
    expect(await clackPrompts.chooseFiles(cwd)).toEqual(["a.json"]);
    expect(await clackPrompts.chooseFiles(cwd)).toBeUndefined();
  });

  it("作るファイルとサンプルの有無を聞く", async () => {
    prompts.text.mockResolvedValueOnce("x.json");
    prompts.confirm.mockResolvedValueOnce(true);
    expect(await clackPrompts.askInit()).toEqual({ file: "x.json", sample: true });
    const validate = (prompts.text.mock.calls[0]![0] as { validate: (v: string) => unknown })
      .validate;
    expect(validate("x")).toBeTruthy();
    expect(validate("")).toBeUndefined();

    prompts.text.mockResolvedValueOnce(CANCEL);
    expect(await clackPrompts.askInit()).toBeUndefined();
    prompts.text.mockResolvedValueOnce("x.json");
    prompts.confirm.mockResolvedValueOnce(CANCEL);
    expect(await clackPrompts.askInit()).toBeUndefined();
  });

  it("キャンセルを伝える", () => {
    clackPrompts.cancelled();
    expect(prompts.cancel).toHaveBeenCalledWith("キャンセルしました");
  });
});
