import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringifyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { describe, expect, it } from "vite-plus/test";
import { createWorkspace, writeSample } from "../testing/fixtures.ts";
import { check } from "./check.ts";

const dense = () => {
  const names = ["a", "b", "c", "d", "e", "f", "g"];
  return {
    version: 1,
    title: "",
    variables: names.map((id, at) => ({
      id,
      label: id,
      position: { x: at * 200, y: (at % 2) * 300 },
    })),
    links: names.flatMap((from) =>
      names
        .filter((to) => to !== from)
        .map((to) => ({ id: `${from}${to}`, from, to, polarity: "+" })),
    ),
    loops: [],
  };
};

const json = (stdout: string[]) => JSON.parse(stdout.join("\n")) as { ok: boolean; data: any };

describe("check", () => {
  it("整った図なら、変数・関連・ループの数を返す", async () => {
    const { context, stdout } = await createWorkspace();
    await writeSample(context.cwd);
    expect(await check("diagram.json", { format: "json" }, context)).toEqual({ kind: "done" });
    const { ok, data } = json(stdout);
    expect(ok).toBe(true);
    expect(data).toMatchObject({
      file: "diagram.json",
      valid: true,
      variables: 7,
      links: 10,
      loops: { R: 2, B: 2, truncated: false },
      unplaced: [],
      layout: { errors: 0, warnings: 0, issues: [] },
    });
    expect(data.loops.list[0]).toMatchObject({ badge: "R1", id: "p_growth", name: "成長エンジン" });
  });

  it("期待と違えば、違いを 1 行ずつ挙げて失敗にする", async () => {
    const { context } = await createWorkspace();
    await writeSample(context.cwd);
    const outcome = await check(
      "diagram.json",
      {
        format: "json",
        expect: JSON.stringify({
          variables: 7,
          links: 9,
          loops: { R: 2, B: 1 },
          has: [
            { kind: "B", through: ["社員数", "一人あたりの業務量", "離職数"] },
            { kind: "R", through: ["sales", "profit"] },
            { through: ["staff", "幽霊"] },
            { kind: "R", through: ["staff", "sales", "profit", "hiring"] },
          ],
        }),
      },
      context,
    );
    expect(outcome).toMatchObject({
      kind: "failure",
      code: "CHECK_FAILED",
      message: "期待との違いが 5 件あります",
      data: {
        expect: {
          passed: false,
          failures: [
            "links: 9 を期待しましたが 10 でした",
            "loops.B: 1 を期待しましたが 2 でした",
            "has.0: 社員数 → 一人あたりの業務量 → 離職数 は B を期待しましたが R でした（極性の - の数を確かめてください）",
            "has.1: sales → profit を通るループがありません",
            'has.2: 変数 "幽霊" がありません',
          ],
        },
      },
    });
  });

  it("配置が崩れていれば、直し方を添えて失敗にする", async () => {
    const { context, stderr } = await createWorkspace();
    const diagram = createSampleDiagram();
    diagram.variables[1]!.position = { ...diagram.variables[0]!.position };
    await writeFile(join(context.cwd, "d.json"), stringifyDiagram(diagram));
    const outcome = await check("d.json", { format: "text", compact: true }, context);
    expect(outcome).toMatchObject({
      kind: "failure",
      message: expect.stringMatching(/^配置の崩れが \d+ 件あります$/),
      suggestions: expect.arrayContaining([
        "loopcraft layout d.json --all で並べ直すと、重なりを直せます",
      ]),
    });
    expect(stderr).toContain('✗ "社員数" と "売上" が重なっています（横 73px・縦 36px）');
  });

  it("座標の無い変数を知らせ、配置してから調べる", async () => {
    const { context, stdout, stderr } = await createWorkspace();
    const diagram = createSampleDiagram();
    const { position: _, ...unplaced } = diagram.variables[3]!;
    await writeFile(
      join(context.cwd, "d.json"),
      JSON.stringify({ ...diagram, variables: diagram.variables.with(3, unplaced as never) }),
    );
    await check("d.json", { format: "text" }, context);
    expect(stdout[0]).toBe("R1  成長エンジン");
    expect(stderr).toContain(
      "座標の無い変数が 1 個あり、自動で配置して調べました（書き込むには loopcraft layout d.json）",
    );
  });

  it("開けない図は、エラーを直し方つきで挙げる", async () => {
    const { context, stderr } = await createWorkspace();
    const diagram = createSampleDiagram();
    await writeFile(
      join(context.cwd, "d.json"),
      JSON.stringify({ ...diagram, links: [{ ...diagram.links[0], to: "sale" }], loops: [] }),
    );
    expect(await check("d.json", { format: "text" }, context)).toMatchObject({
      kind: "failure",
      code: "INVALID_DIAGRAM",
      message: "1 件のエラーがあります",
    });
    expect(stderr).toContain('  links.0.to: 変数 "sale" は存在しません（"sales" のことですか）');
    expect(await check("d.json", { format: "json" }, context)).toMatchObject({
      data: { errors: [{ path: "links.0.to", hint: '"sales" のことですか' }] },
    });
    expect(await check("none.json", { format: "text" }, context)).toMatchObject({
      code: "FILE_NOT_FOUND",
    });
  });

  it("読めない --expect は使い方の誤りにする", async () => {
    const { context } = await createWorkspace();
    await writeSample(context.cwd);
    expect(await check("diagram.json", { format: "json", expect: "{" }, context)).toMatchObject({
      kind: "usage",
      code: "INVALID_EXPECT",
    });
    expect(
      await check("diagram.json", { format: "json", expect: '{"loop":1}' }, context),
    ).toMatchObject({
      kind: "usage",
      message: expect.stringContaining("--expect の loop が読めません"),
    });
  });

  it("期待するループは辿る向きまで比べる", async () => {
    const { context } = await createWorkspace();
    const v = (id: string, x: number, y: number) => ({
      id,
      label: id.toUpperCase(),
      position: { x, y },
    });
    const l = (from: string, to: string, polarity: string) => ({
      id: `${from}${to}`,
      from,
      to,
      polarity,
    });
    await writeFile(
      join(context.cwd, "t.json"),
      JSON.stringify({
        version: 1,
        title: "",
        variables: [v("a", 0, 0), v("b", 300, 0), v("c", 150, 260)],
        links: [
          l("a", "b", "+"),
          l("b", "c", "+"),
          l("c", "a", "+"),
          l("a", "c", "+"),
          l("c", "b", "+"),
          l("b", "a", "-"),
        ],
        loops: [],
      }),
    );
    const run = (has: unknown) =>
      check("t.json", { format: "json", expect: JSON.stringify({ has: [has] }) }, context);
    expect(await run({ kind: "B", through: ["A", "C", "B"] })).toEqual({ kind: "done" });
    expect(await run({ kind: "R", through: ["b", "c", "a"] })).toEqual({ kind: "done" });
    expect(await run({ kind: "R", through: ["A", "C", "B"] })).toMatchObject({
      data: { expect: { failures: [expect.stringContaining("R を期待しましたが B でした")] } },
    });
  });

  it("突き抜けには、並べ直しでなく位置や曲がり具合を直すよう案内する", async () => {
    const { context } = await createWorkspace();
    const v = (id: string, x: number) => ({ id, label: id, position: { x, y: 0 } });
    await writeFile(
      join(context.cwd, "line.json"),
      JSON.stringify({
        version: 1,
        title: "",
        variables: [v("a", 0), v("b", 200), v("c", 400)],
        links: [{ id: "ac", from: "a", to: "c", polarity: "+" }],
        loops: [],
      }),
    );
    expect(await check("line.json", { format: "json" }, context)).toMatchObject({
      suggestions: [expect.stringContaining("update-variable で position をずらすか")],
    });
  });

  it("ループを数えきれないときは、そう知らせ、数の期待は判定できないとする", async () => {
    const { context, stderr } = await createWorkspace();
    await writeFile(join(context.cwd, "dense.json"), JSON.stringify(dense()));
    const outcome = await check(
      "dense.json",
      {
        format: "text",
        compact: true,
        expect: JSON.stringify({ loops: { R: 500 }, has: [{ through: ["a", "c", "b"] }] }),
      },
      context,
    );
    expect(stderr).toContain("⚠ ループが多いため、先頭の 500 件だけを数えています");
    expect(outcome).toMatchObject({
      data: {
        expect: {
          failures: expect.arrayContaining([
            "loops: ループが多く、すべては数えられないので、数を判定できません",
          ]),
        },
      },
    });
  });

  it("同じラベルの変数が複数あれば、期待するループを ID で指すよう求める", async () => {
    const { context } = await createWorkspace();
    const diagram = createSampleDiagram();
    diagram.variables[1]!.label = "社員数";
    await writeFile(join(context.cwd, "d.json"), stringifyDiagram(diagram));
    expect(
      await check(
        "d.json",
        { format: "json", expect: JSON.stringify({ has: [{ through: ["社員数", "利益"] }] }) },
        context,
      ),
    ).toMatchObject({
      data: {
        expect: {
          failures: [
            'has.0: "社員数" というラベルの変数が 2 個あります。ID で指してください（staff, sales）',
          ],
        },
      },
    });
  });
});
