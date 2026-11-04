import { createSampleDiagram } from "@loopcraft/core/sample";
import type { Diagram } from "@loopcraft/core/schema";
import { describe, expect, it } from "vite-plus/test";
import { createTools } from "./tools.ts";
import type { DiagramAccess, ToolFailure } from "./tools.ts";

function setup(initial: Diagram | ToolFailure = createSampleDiagram()) {
  let current = initial;
  const changes: { before: Diagram; after: Diagram }[] = [];
  const checks: unknown[] = [];
  const access: DiagramAccess = {
    read: async () => current,
    update: async (change) => {
      if ("failure" in current) return current;
      const next = change(current);
      if ("failure" in next) return next;
      const before = current;
      current = next;
      return { before, after: next };
    },
  };
  const tools = createTools(access, {
    changed: (before, after) => changes.push({ before, after }),
    checked: (summary) => checks.push(summary),
  });
  const run = (name: string, input: unknown = {}) =>
    tools.find((tool) => tool.name === name)!.run(input);
  return { run, changes, checks, diagram: () => current as Diagram };
}

describe("createTools", () => {
  it("get_diagram は図と、見つかったループと、配置の崩れを返す", async () => {
    const { run } = setup();
    const result = await run("get_diagram");
    expect(result).toMatchObject({
      ok: true,
      data: { diagram: createSampleDiagram(), truncated: false, layout: { errors: 0 } },
    });
    const { data } = result as { data: { loops: { name: string }[] } };
    expect(data.loops.map((loop) => loop.name)).toContain("成長エンジン");
  });

  it("apply_operations は操作をまとめて当て、変えた内容を伝え、足した ID を返す", async () => {
    const { run, changes, diagram } = setup();
    const result = await run("apply_operations", {
      operations: [
        { op: "add-variable", id: "meeting", label: "面談の回数" },
        { op: "add-link", from: "離職数", to: "meeting", polarity: "+" },
      ],
    });
    expect(result).toMatchObject({ ok: true, data: { ids: ["meeting", expect.any(String)] } });
    expect(changes).toHaveLength(1);
    expect(diagram().variables.map((variable) => variable.label)).toContain("面談の回数");
  });

  it("apply_operations は、1 つでも当てられなければ何も変えず、理由を返す", async () => {
    const { run, changes } = setup();
    expect(await run("apply_operations", {})).toEqual({
      ok: false,
      message: "operations に操作の配列を渡してください",
    });
    expect(await run("apply_operations", { operations: [] })).toEqual({
      ok: false,
      message: "操作が 1 つもありません",
    });
    const unknown = await run("apply_operations", { operations: [{ op: "explode" }] });
    expect(unknown).toMatchObject({ ok: false, message: expect.stringMatching(/^0 番目の操作: /) });
    const missing = await run("apply_operations", {
      operations: [
        { op: "add-variable", id: "meeting", label: "面談の回数" },
        { op: "remove-variable", id: "存在しない" },
      ],
    });
    expect(missing).toMatchObject({
      ok: false,
      message: expect.stringMatching(
        /^1 番目の操作（remove-variable）: [\s\S]*どの操作も反映していません$/,
      ),
    });
    expect(changes).toEqual([]);
  });

  it("layout は図を並べ直し、pin の変数は動かさない", async () => {
    const { run, changes, diagram } = setup();
    const before = diagram().variables.find((variable) => variable.id === "attrition")!.position;
    expect(await run("layout", { pin: ["離職数"] })).toMatchObject({ ok: true });
    expect(diagram().variables.find((variable) => variable.id === "attrition")!.position).toEqual(
      before,
    );
    expect(changes).toHaveLength(1);
    expect(await run("layout", undefined)).toMatchObject({ ok: true });
  });

  it("layout は pin の形が違うか、変数が無ければ変えない", async () => {
    const { run, changes } = setup();
    expect(await run("layout", { pin: "離職数" })).toEqual({
      ok: false,
      message: "pin は文字列の配列です",
    });
    expect(await run("layout", { pin: ["存在しない"] })).toEqual({
      ok: false,
      message: 'pin: 変数 "存在しない" がありません',
    });
    expect(changes).toEqual([]);
  });

  it("check はループの数と配置の崩れを返し、確かめたことを伝える", async () => {
    const { run, checks } = setup();
    expect(await run("check")).toMatchObject({ ok: true, data: { layout: { errors: 0 } } });
    expect(checks).toEqual([
      { loops: { R: expect.any(Number), B: expect.any(Number) }, errors: 0 },
    ]);
  });

  it("図を読めなければ、その理由を返す", async () => {
    const { run } = setup({ failure: "図を読めません" });
    for (const name of ["get_diagram", "check", "layout"]) {
      expect(await run(name)).toEqual({ ok: false, message: "図を読めません" });
    }
    expect(
      await run("apply_operations", { operations: [{ op: "set-title", title: "x" }] }),
    ).toEqual({ ok: false, message: "図を読めません" });
  });
});
