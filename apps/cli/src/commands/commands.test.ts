import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringifyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import type { Diagram } from "@loopcraft/core/schema";
import { describe, expect, it } from "vite-plus/test";
import { createWorkspace, writeSample } from "../testing/fixtures.ts";
import { DEFAULT_FILE, init } from "./init.ts";
import { loops } from "./loops.ts";
import { schema } from "./schema.ts";
import { validate } from "./validate.ts";

describe("validate", () => {
  it("問題が無ければ件数を伝える", async () => {
    const { context, stderr } = await createWorkspace();
    await writeSample(context.cwd);
    await validate(["diagram.json"], { format: "text" }, context);
    expect(stderr).toContain("✓ diagram.json");
    expect(stderr.at(-1)).toBe("✓ 1 件のファイルに問題はありません");
  });

  it("問題のあるファイルを場所つきで挙げ、終了コード 1 で終える", async () => {
    const { context, stderr } = await createWorkspace();
    await writeSample(context.cwd);
    await writeFile(join(context.cwd, "broken.json"), "{");
    await mkdir(join(context.cwd, "dir.json"));
    const outcome = await validate(
      ["diagram.json", "broken.json", "missing.json", "dir.json"],
      { format: "text" },
      context,
    );
    expect(outcome).toMatchObject({
      kind: "failure",
      code: "INVALID_DIAGRAM",
      message: "4 件中 3 件のファイルにエラーがあります",
    });
    expect(stderr).toContain("✗ missing.json");
    expect(stderr).toContain("  ファイルが見つかりません");
    expect(stderr).toContain("✗ dir.json");
  });

  it("JSON で結果を stdout に出す", async () => {
    const { context, stdout } = await createWorkspace();
    await writeSample(context.cwd);
    await validate(["diagram.json"], { format: "json" }, context);
    expect(JSON.parse(stdout.join("\n"))).toEqual({
      ok: true,
      data: { files: [{ file: "diagram.json", valid: true, errors: [], unplaced: [] }] },
    });
  });

  it("ファイルが無ければ使い方の誤り", async () => {
    const { context } = await createWorkspace();
    expect(await validate([], { format: "text" }, context)).toMatchObject({ kind: "usage" });
  });
});

describe("init", () => {
  it("既定の名前で空の図を作る", async () => {
    const { context, stderr } = await createWorkspace();
    await init(DEFAULT_FILE, {}, context);
    const diagram = JSON.parse(await readFile(join(context.cwd, DEFAULT_FILE), "utf8")) as Diagram;
    expect(diagram.variables).toEqual([]);
    expect(stderr[0]).toBe("✓ diagram.json を作成しました");
  });

  it("サンプルとタイトルを指定できる", async () => {
    const { context } = await createWorkspace();
    await init("growth.json", { sample: true, title: "成長" }, context);
    const diagram = JSON.parse(await readFile(join(context.cwd, "growth.json"), "utf8")) as Diagram;
    expect(diagram.title).toBe("成長");
    expect(diagram.variables.length).toBeGreaterThan(0);
    await init("titled.json", { title: "題" }, context);
    const titled = JSON.parse(await readFile(join(context.cwd, "titled.json"), "utf8")) as Diagram;
    expect(titled.title).toBe("題");
  });

  it("既にあるファイルは --force が無ければ上書きしない", async () => {
    const { context } = await createWorkspace();
    await writeSample(context.cwd);
    expect(await init("diagram.json", {}, context)).toMatchObject({ kind: "usage" });
    await init("diagram.json", { force: true }, context);
    const diagram = JSON.parse(
      await readFile(join(context.cwd, "diagram.json"), "utf8"),
    ) as Diagram;
    expect(diagram.variables).toEqual([]);
  });

  it("ディレクトリが無ければ使い方の誤りとして伝える", async () => {
    const { context } = await createWorkspace();
    expect(await init("newdir/diagram.json", {}, context)).toEqual({
      kind: "usage",
      message: "newdir というディレクトリがありません",
    });
    await writeFile(join(context.cwd, "file"), "");
    expect(await init("file/diagram.json", {}, context)).toMatchObject({ kind: "usage" });
  });

  it("存在を確かめられないときはエラーを投げる", async () => {
    const { context } = await createWorkspace();
    await mkdir(join(context.cwd, "locked"));
    await writeFile(join(context.cwd, "locked", "diagram.json"), "");
    await chmod(join(context.cwd, "locked"), 0o000);
    try {
      await expect(init("locked/diagram.json", {}, context)).rejects.toThrow();
    } finally {
      await chmod(join(context.cwd, "locked"), 0o755);
    }
  });
});

describe("loops", () => {
  it("注目するループを番号付きで、残りを後に出す", async () => {
    const { context, stdout } = await createWorkspace();
    await writeSample(context.cwd);
    await loops("diagram.json", { format: "text" }, context);
    expect(stdout[0]).toBe("R1  成長エンジン");
    expect(stdout[1]).toBe("    社員数 → 売上 → 利益 → 採用数");
    expect(stdout.at(-2)).toBe("B   バランスループ（注目していない）");
  });

  it("Markdown と JSON で出し、種類で絞り込める", async () => {
    const workspace = await createWorkspace();
    const diagram = createSampleDiagram();
    diagram.loops[0]!.name = "成長|エンジン";
    await writeFile(join(workspace.cwd, "d.json"), stringifyDiagram(diagram));
    await loops("d.json", { format: "md", kind: "r" }, workspace.context);
    expect(workspace.stdout[0]).toBe("| ループ | 名前 | 経路 |\n| --- | --- | --- |");
    expect(workspace.stdout[1]).toBe("| R1 | 成長\\|エンジン | 社員数 → 売上 → 利益 → 採用数 |");
    expect(workspace.stdout).toHaveLength(3);

    const json = await createWorkspace();
    await writeSample(json.cwd);
    await loops("diagram.json", { format: "json", kind: "b" }, json.context);
    const { data } = JSON.parse(json.stdout.join("\n")) as {
      data: { loops: { badge: string; featured: boolean }[] };
    };
    expect(data.loops.map((row) => [row.badge, row.featured])).toEqual([
      ["B1", true],
      ["B", false],
    ]);
  });

  it("ループが無ければそう伝える", async () => {
    const { context, stderr } = await createWorkspace();
    await writeFile(
      join(context.cwd, "empty.json"),
      stringifyDiagram({ ...createSampleDiagram(), links: [], loops: [] }),
    );
    await loops("empty.json", { format: "text" }, context);
    expect(stderr).toEqual(["ℹ ループはありません"]);
  });

  it("名前の無い変数は名称未設定と出す", async () => {
    const { context, stdout } = await createWorkspace();
    const diagram = createSampleDiagram();
    diagram.variables[0]!.label = "";
    await writeFile(join(context.cwd, "d.json"), stringifyDiagram(diagram));
    await loops("d.json", { format: "text" }, context);
    expect(stdout[1]).toContain("名称未設定");
  });

  it("ループが多すぎれば打ち切ったことを伝える", async () => {
    const { context, stderr } = await createWorkspace();
    const names = ["a", "b", "c", "d", "e", "f", "g"];
    const diagram: Diagram = {
      version: 1,
      title: "",
      variables: names.map((id) => ({
        id,
        label: id,
        position: { x: 0, y: 0 },
      })) as Diagram["variables"],
      links: names.flatMap((from) =>
        names
          .filter((to) => to !== from)
          .map((to) => ({ id: `${from}${to}`, from, to, polarity: "+" })),
      ) as Diagram["links"],
      loops: [],
    };
    await writeFile(join(context.cwd, "dense.json"), stringifyDiagram(diagram));
    await loops("dense.json", { format: "json" }, context);
    expect(stderr.at(-1)).toMatch(/^⚠ ループが多いため/);
  });

  it("無いファイルや壊れたファイルは失敗にし、名前の近いファイルを示す", async () => {
    const { context } = await createWorkspace();
    expect(await loops("none.json", { format: "text" }, context)).toMatchObject({
      kind: "failure",
    });
    await writeSample(context.cwd);
    expect(await loops("diagrm.json", { format: "text" }, context)).toMatchObject({
      code: "FILE_NOT_FOUND",
      suggestions: [
        "diagram.json のことですか",
        "新しく作るときは loopcraft edit diagrm.json - に操作を渡してください",
      ],
    });
    await writeFile(join(context.cwd, "broken.json"), "{");
    expect(await loops("broken.json", { format: "text" }, context)).toMatchObject({
      kind: "failure",
      message: expect.stringContaining("broken.json を開けません"),
    });
  });
});

describe("schema", () => {
  it("JSON Schema を stdout に出す", async () => {
    const { context, stdout } = await createWorkspace();
    schema(context);
    expect(JSON.parse(stdout.join("\n"))).toMatchObject({ title: "SystemDiagram" });
  });
});
