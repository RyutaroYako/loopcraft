import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { describe, expect, it } from "vite-plus/test";
import {
  isNotFound,
  listJsonFiles,
  readDiagramFile,
  revisionOf,
  writeDiagramFile,
} from "./files.ts";
import { createWorkspace, writeSample } from "./testing/fixtures.ts";

describe("files", () => {
  it("同じ内容なら同じ版になる", () => {
    expect(revisionOf("a")).toBe(revisionOf("a"));
    expect(revisionOf("a")).not.toBe(revisionOf("b"));
  });

  it("図を読み、無ければ missing、壊れていれば invalid", async () => {
    const { cwd } = await createWorkspace();
    const path = await writeSample(cwd);
    const ok = await readDiagramFile(path);
    expect(ok.status).toBe("ok");
    expect(await readDiagramFile(join(cwd, "none.json"))).toEqual({ status: "missing" });
    await writeFile(join(cwd, "broken.json"), "{");
    const broken = await readDiagramFile(join(cwd, "broken.json"));
    expect(broken).toMatchObject({ status: "invalid" });
    await writeFile(
      join(cwd, "dangling.json"),
      JSON.stringify({
        ...createSampleDiagram(),
        links: [{ id: "x", from: "staff", to: "ghost", polarity: "+" }],
        loops: [],
      }),
    );
    const dangling = await readDiagramFile(join(cwd, "dangling.json"));
    expect(dangling.status === "invalid" && dangling.errors[0]).toMatch(/^links\.0\.to: /);
  });

  it("ディレクトリなど読めないものはエラーを投げる", async () => {
    const { cwd } = await createWorkspace();
    await mkdir(join(cwd, "dir.json"));
    await expect(readDiagramFile(join(cwd, "dir.json"))).rejects.toThrow();
  });

  it("一時ファイル経由で書き、版を返す", async () => {
    const { cwd } = await createWorkspace();
    const path = join(cwd, "out.json");
    const revision = await writeDiagramFile(path, createSampleDiagram());
    expect(revision).toBe(revisionOf(await readFile(path, "utf8")));
    expect(await readdir(cwd)).toEqual(["out.json"]);
  });

  it("書けなかったら一時ファイルを残さない", async () => {
    const { cwd } = await createWorkspace();
    await mkdir(join(cwd, "taken.json"));
    await writeFile(join(cwd, "taken.json", "child"), "x");
    await expect(
      writeDiagramFile(join(cwd, "taken.json"), createSampleDiagram()),
    ).rejects.toThrow();
    expect((await readdir(cwd)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("候補にする JSON ファイルだけを並べる", async () => {
    const { cwd } = await createWorkspace();
    for (const name of ["b.json", "a.json", "package.json", ".hidden.json", "note.txt"]) {
      await writeFile(join(cwd, name), "{}");
    }
    await mkdir(join(cwd, "folder.json"));
    expect(await listJsonFiles(cwd)).toEqual(["a.json", "b.json"]);
  });

  it("ファイルが無いエラーを見分ける", () => {
    expect(isNotFound(Object.assign(new Error("x"), { code: "ENOENT" }))).toBe(true);
    expect(isNotFound(new Error("x"))).toBe(false);
    expect(isNotFound("ENOENT")).toBe(false);
  });
});
