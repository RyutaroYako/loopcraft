import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { exitCodeOf, FailureError, UsageError } from "./errors.ts";
import { renderHeader } from "./header.ts";
import { readVersion } from "./version.ts";

describe("errors", () => {
  it("使い方の誤りは 2、失敗とそれ以外は 1", () => {
    expect(exitCodeOf(new UsageError("x"))).toBe(2);
    expect(exitCodeOf(new FailureError("x"))).toBe(1);
    expect(exitCodeOf(new Error("x"))).toBe(1);
  });
});

describe("header", () => {
  it("色の有無で表示を変える", () => {
    expect(renderHeader("1.2.3", false)).toBe("Loopcraft — 因果ループ図エディタ v1.2.3");
    expect(renderHeader("1.2.3", true)).toContain("\u001B[");
  });
});

describe("readVersion", () => {
  it("package.json の version を読む", async () => {
    expect(readVersion()).toMatch(/^\d+\.\d+\.\d+/);
    const dir = await mkdtemp(join(tmpdir(), "loopcraft-version-"));
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    expect(() => readVersion(pathToFileURL(join(dir, "package.json")))).toThrow("version");
  });
});
