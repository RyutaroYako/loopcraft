import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringifyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { describe, expect, it } from "vite-plus/test";
import { createWorkspace, writeSample } from "../testing/fixtures.ts";
import { check } from "./check.ts";

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
      suggestions: ["loopcraft layout d.json --all で並べ直すと、重なりと突き抜けを直せます"],
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
});
