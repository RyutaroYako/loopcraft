import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { createWorkspace, writeSample } from "../testing/fixtures.ts";
import { edit } from "./edit.ts";

const stdin = (text: string) => ({ readStdin: () => Promise.resolve(text) });
const noStdin = { readStdin: () => undefined };
const lines = (...items: unknown[]) => items.map((item) => JSON.stringify(item)).join("\n");

describe("edit", () => {
  it("無いファイルを、標準入力の操作から作る", async () => {
    const { context, stdout } = await createWorkspace();
    const outcome = await edit(
      "new.json",
      "-",
      { format: "json" },
      context,
      stdin(
        `${lines(
          { op: "add-variable", id: "a", label: "A" },
          { op: "add-variable", id: "b", label: "B" },
          { op: "add-link", from: "a", to: "b" },
          { op: "add-link", from: "b", to: "a", polarity: "-" },
          { op: "add-loop", through: ["a", "b"], name: "ab" },
        )}\n\n`,
      ),
    );
    expect(outcome).toEqual({ kind: "done" });
    expect(JSON.parse(stdout.join(""))).toEqual({
      ok: true,
      data: {
        file: "new.json",
        written: true,
        created: true,
        applied: 5,
        ids: ["a", "b", "a_b", "b_a", "loop1"],
        variables: 2,
        links: 2,
        loops: { R: 0, B: 1 },
        layout: { errors: 0, warnings: 0, issues: [] },
      },
    });
    const saved = JSON.parse(await readFile(join(context.cwd, "new.json"), "utf8"));
    expect(saved.loops[0].name).toBe("ab");
  });

  it("操作のファイルや JSON の配列も受け付け、--dry-run なら書き込まない", async () => {
    const { context, stderr } = await createWorkspace();
    const path = await writeSample(context.cwd);
    const before = await readFile(path, "utf8");
    await writeFile(
      join(context.cwd, "ops.json"),
      JSON.stringify([
        { op: "set-title", title: "題" },
        { op: "add-variable", label: "新" },
      ]),
    );
    const outcome = await edit(
      "diagram.json",
      "ops.json",
      { format: "text", dryRun: true },
      context,
      noStdin,
    );
    expect(outcome).toEqual({ kind: "done" });
    expect(await readFile(path, "utf8")).toBe(before);
    expect(stderr[0]).toBe(
      "✓ diagram.json に 2 件の操作を反映できます（--dry-run なので書き込んでいません）",
    );
    expect(stderr).toContain("  add-variable: v1");
  });

  it("失敗した操作の行と直し方を返し、何も書き込まない", async () => {
    const { context } = await createWorkspace();
    const path = await writeSample(context.cwd);
    const before = await readFile(path, "utf8");
    const outcome = await edit(
      "diagram.json",
      "-",
      { format: "json" },
      context,
      stdin(
        lines({ op: "add-variable", label: "x" }, { op: "add-link", from: "sale", to: "staff" }),
      ),
    );
    expect(outcome).toMatchObject({
      kind: "failure",
      code: "INVALID_OPERATION",
      message: '2 行目（add-link）: 変数 "sale" はありません',
      suggestions: [
        '"sales" のことですか',
        "どの操作も反映していません。直してから、すべての操作をもう一度渡してください",
      ],
    });
    expect(await readFile(path, "utf8")).toBe(before);
  });

  it("読めない操作は、行と書き方を示す", async () => {
    const { context } = await createWorkspace();
    const run = (text: string) => edit("d.json", "-", { format: "json" }, context, stdin(text));
    expect(await run('{"op":"add-variable",\n"label":"x"}')).toMatchObject({
      message: "1 行目を JSON として読めません",
      suggestions: ["操作は 1 行に 1 つの JSON で書きます。途中で改行しないでください"],
    });
    expect(await run('{"op":"add-varible","label":"x"}')).toMatchObject({
      message: '1 行目: 知らない操作 "add-varible" です',
      suggestions: ['"add-variable" のことですか'],
    });
    expect(await run('{"op":"add-variable","lable":"x"}')).toMatchObject({
      suggestions: ["操作の書き方は loopcraft edit --help にあります"],
    });
    expect(await run("[1,")).toMatchObject({
      message: expect.stringMatching(/^JSON として読めません/),
    });
    expect(await run('{"a":1}'.replace("{", "[").replace("}", "]"))).toMatchObject({
      message: expect.stringMatching(/^JSON として読めません|操作の配列/),
    });
    expect(await run('"x"'.replace('"x"', "[]"))).toMatchObject({ kind: "usage" });
    expect(await run("")).toMatchObject({ kind: "usage", message: "操作が 1 つもありません" });
  });

  it("操作が無い・読めないときは使い方の誤りにする", async () => {
    const { context } = await createWorkspace();
    expect(await edit("d.json", undefined, { format: "text" }, context, noStdin)).toMatchObject({
      kind: "usage",
      message: "操作を標準入力か、ファイルで渡してください",
    });
    expect(await edit("d.json", "none.jsonl", { format: "text" }, context, noStdin)).toMatchObject({
      kind: "usage",
      message: "none.jsonl が見つかりません",
    });
    await writeFile(join(context.cwd, "broken.json"), "{");
    expect(
      await edit(
        "broken.json",
        "-",
        { format: "text" },
        context,
        stdin(lines({ op: "set-title", title: "t" })),
      ),
    ).toMatchObject({ code: "INVALID_DIAGRAM" });
  });
});
