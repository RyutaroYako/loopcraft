import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringifyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import type { Diagram } from "@loopcraft/core/schema";
import { describe, expect, it } from "vite-plus/test";
import { createWorkspace, writeSample } from "../testing/fixtures.ts";
import { layout } from "./layout.ts";

const read = async (path: string) => JSON.parse(await readFile(path, "utf8")) as Diagram;

describe("layout", () => {
  it("座標の無い変数だけを置いて書き込み、ほかは動かさない", async () => {
    const { context, stdout } = await createWorkspace();
    const diagram = createSampleDiagram();
    const { position: _, ...unplaced } = diagram.variables[2]!;
    const path = join(context.cwd, "d.json");
    await writeFile(
      path,
      JSON.stringify({ ...diagram, variables: diagram.variables.with(2, unplaced as never) }),
    );
    await layout("d.json", { format: "json" }, context);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      ok: true,
      data: { file: "d.json", written: true, moved: ["profit"], layout: { errors: 0 } },
    });
    const saved = await read(path);
    expect(saved.variables[2]!.position).toEqual({ x: expect.any(Number), y: expect.any(Number) });
    expect(saved.variables[0]!.position).toEqual(diagram.variables[0]!.position);
  });

  it("座標がそろっていれば書き込まず、--all を案内する", async () => {
    const { context, stderr } = await createWorkspace();
    const path = await writeSample(context.cwd);
    const before = await readFile(path, "utf8");
    await layout("diagram.json", { format: "text" }, context);
    expect(stderr[0]).toBe(
      "ℹ 座標の無い変数はありません。座標のある変数も並べ直すには --all を付けてください",
    );
    expect(await readFile(path, "utf8")).toBe(before);
    const json = await createWorkspace();
    await writeSample(json.cwd);
    await layout("diagram.json", { format: "json" }, json.context);
    expect(JSON.parse(json.stdout.join(""))).toMatchObject({ data: { written: false, moved: [] } });
  });

  it("--all で重なりを直し、--pin の変数は動かさない", async () => {
    const { context, stderr } = await createWorkspace();
    const diagram = createSampleDiagram();
    const stacked = {
      ...diagram,
      variables: diagram.variables.map((variable) => ({ ...variable, position: { x: 0, y: 0 } })),
    };
    const path = join(context.cwd, "d.json");
    await writeFile(path, stringifyDiagram(stacked));
    await layout("d.json", { format: "text", all: true, pin: ["社員数"] }, context);
    expect(stderr[0]).toMatch(/^✓ d.json の \d+ 個の変数を配置しました$/);
    const saved = await read(path);
    expect(saved.variables[0]!.position).toEqual({ x: 0, y: 0 });
    expect(
      new Set(saved.variables.map((variable) => `${variable.position.x},${variable.position.y}`))
        .size,
    ).toBe(7);
  });

  it("--pin の誤りは使い方の誤りにする", async () => {
    const { context } = await createWorkspace();
    await writeSample(context.cwd);
    expect(await layout("diagram.json", { format: "text", pin: ["staff"] }, context)).toMatchObject(
      {
        kind: "usage",
        suggestions: ["loopcraft layout diagram.json --all --pin staff"],
      },
    );
    expect(
      await layout("diagram.json", { format: "text", all: true, pin: ["ghost"] }, context),
    ).toMatchObject({ kind: "usage", message: '--pin の変数 "ghost" がありません' });
    expect(await layout("none.json", { format: "text" }, context)).toMatchObject({
      code: "FILE_NOT_FOUND",
    });
  });
});
