import { describe, expect, it } from "vite-plus/test";
import { estimateNodeSizes } from "./geometry.ts";
import { createEmptyDiagram } from "./io.ts";
import { findLayoutIssues } from "./layout-check.ts";
import { applyOperations, parseOperation } from "./operations.ts";
import type { Operation } from "./operations.ts";
import { createSampleDiagram } from "./sample.ts";
import type { Diagram } from "./schema.ts";

const ops = (...items: unknown[]): Operation[] =>
  items.map((item) => {
    const parsed = parseOperation(item);
    if (!parsed.ok) throw new Error(parsed.message);
    return parsed.operation;
  });

const applied = (diagram: Diagram, operations: Operation[]) => {
  const result = applyOperations(diagram, operations);
  if (!result.ok) throw new Error(result.error.message);
  return result;
};

const failed = (diagram: Diagram, operations: Operation[]) => {
  const result = applyOperations(diagram, operations);
  if (result.ok) throw new Error("applied");
  return result.error;
};

describe("parseOperation", () => {
  it("知らない操作には近い操作を示し、知らないキーはエラーにする", () => {
    expect(parseOperation({ op: "add-varible", label: "x" })).toEqual({
      ok: false,
      message: '知らない操作 "add-varible" です',
      hint: '"add-variable" のことですか',
    });
    expect(parseOperation({ op: "frobnicate" })).toMatchObject({
      hint: expect.stringContaining("使える操作は add-variable"),
    });
    expect(parseOperation({ op: "add-variable", label: "x", lable: "y" })).toEqual({
      ok: false,
      message: '知らないキー "lable" です',
    });
    expect(parseOperation({ op: "add-link", from: "a" })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/^to: /),
    });
  });
});

describe("applyOperations", () => {
  it("空の図から変数・関連・ループを作り、座標の無い変数を重ならないように置く", () => {
    const result = applied(
      createEmptyDiagram(),
      ops(
        { op: "set-title", title: "成長" },
        { op: "set-description", description: "説明" },
        { op: "add-variable", id: "sales", label: "売上", description: "月の売上" },
        { op: "add-variable", label: "社員数" },
        {
          op: "add-link",
          from: "sales",
          to: "社員数",
          polarity: "+",
          delay: true,
          description: "雇う",
        },
        { op: "add-link", from: "v1", to: "sales" },
        { op: "add-loop", through: ["売上", "社員数"], name: "成長", description: "伸びる" },
      ),
    );
    expect(result.ids).toEqual([null, null, "sales", "v1", "sales_v1", "v1_sales", "loop1"]);
    const { diagram } = result;
    expect(diagram).toMatchObject({ title: "成長", description: "説明" });
    expect(diagram.variables[0]).toMatchObject({ id: "sales", description: "月の売上" });
    expect(diagram.links[0]).toMatchObject({ polarity: "+", delay: true, description: "雇う" });
    expect(diagram.links[1]!.polarity).toBe("+");
    expect(diagram.loops).toMatchObject([
      { id: "loop1", name: "成長", links: ["sales_v1", "v1_sales"], description: "伸びる" },
    ]);
    expect(findLayoutIssues(diagram, estimateNodeSizes(diagram.variables))).toEqual([]);
  });

  it("位置を指定した変数はその位置に置き、ほかの変数は動かさない", () => {
    const sample = createSampleDiagram();
    const { diagram } = applied(
      sample,
      ops(
        { op: "add-variable", id: "cs", label: "顧客満足度" },
        { op: "add-variable", id: "fixed", label: "固定", position: { x: 1000, y: 1000 } },
        { op: "add-link", from: "workload", to: "cs", polarity: "-" },
      ),
    );
    for (const variable of sample.variables) {
      expect(diagram.variables.find((item) => item.id === variable.id)!.position).toEqual(
        variable.position,
      );
    }
    expect(diagram.variables.find((item) => item.id === "fixed")!.position).toEqual({
      x: 1000,
      y: 1000,
    });
  });

  it("変数・関連・ループを書き換え、消す", () => {
    const { diagram } = applied(
      createSampleDiagram(),
      ops(
        {
          op: "update-variable",
          id: "社員数",
          label: "人数",
          description: "d",
          position: { x: 1, y: 2 },
        },
        { op: "update-variable", id: "sales", description: "" },
        {
          op: "update-link",
          from: "staff",
          to: "sales",
          polarity: "-",
          delay: true,
          curvature: 0.2,
          description: "x",
        },
        { op: "update-link", id: "l_hire", delay: false, curvature: null, description: "" },
        { op: "update-loop", id: "成長エンジン", name: "伸び", description: "y" },
        { op: "update-loop", id: "p_training", description: "" },
        { op: "remove-link", from: "staff", to: "workload" },
        { op: "remove-loop", id: "p_training" },
        { op: "remove-variable", id: "training" },
        { op: "remove-link", id: "l_demand" },
      ),
    );
    expect(diagram.variables.find((item) => item.id === "staff")).toMatchObject({
      label: "人数",
      description: "d",
      position: { x: 1, y: 2 },
    });
    expect(diagram.links.find((link) => link.id === "l_sales")).toMatchObject({
      polarity: "-",
      delay: true,
      curvature: 0.2,
      description: "x",
    });
    expect(diagram.links.find((link) => link.id === "l_hire")).not.toHaveProperty("delay");
    expect(diagram.loops.map((loop) => loop.name)).toEqual(["伸び"]);
    expect(diagram.variables.some((item) => item.id === "training")).toBe(false);
    expect(
      diagram.links.some((link) => ["l_train", "l_cost", "l_share", "l_demand"].includes(link.id)),
    ).toBe(false);
  });

  it("参照の誤りには、何番目の操作かと、近い候補を返す", () => {
    const sample = createSampleDiagram();
    expect(failed(sample, ops({ op: "add-link", from: "sale", to: "staff" }))).toEqual({
      index: 0,
      message: '変数 "sale" はありません',
      hint: '"sales" のことですか',
    });
    expect(
      failed(sample, ops({ op: "add-variable", label: "x" }, { op: "remove-link", id: "l_sale" })),
    ).toMatchObject({ index: 1, hint: '"l_sales" のことですか' });
    expect(failed(sample, ops({ op: "remove-loop", id: "成長エンジソ" }))).toMatchObject({
      hint: '"成長エンジン" のことですか',
    });
    expect(failed(sample, ops({ op: "update-link", polarity: "-" }))).toMatchObject({
      message: "関連は id か、from と to の組で指してください",
    });
    expect(failed(sample, ops({ op: "remove-link", from: "sales", to: "staff" }))).toMatchObject({
      message: '"sales" から "staff" への関連はありません',
    });
    const twins = applied(sample, ops({ op: "add-variable", id: "twin", label: "売上" })).diagram;
    expect(failed(twins, ops({ op: "remove-variable", id: "売上" }))).toMatchObject({
      message: '"売上" というラベルの変数が 2 個あります',
      hint: "ID で指してください: sales, twin",
    });
  });

  it("重複や作れない関連を、直し方つきで断る", () => {
    const sample = createSampleDiagram();
    expect(failed(sample, ops({ op: "add-variable", id: "sales", label: "x" }))).toMatchObject({
      message: '変数 "sales" は既にあります',
    });
    expect(
      failed(sample, ops({ op: "add-link", id: "l_sales", from: "sales", to: "profit" })),
    ).toMatchObject({
      message: '関連 "l_sales" は既にあります',
    });
    expect(failed(sample, ops({ op: "add-link", from: "staff", to: "sales" }))).toMatchObject({
      message: '"staff" から "sales" への関連は既にあります（"l_sales"）',
      hint: "極性などを変えるときは update-link を使ってください",
    });
    expect(failed(sample, ops({ op: "add-link", from: "staff", to: "staff" }))).toMatchObject({
      message: "自分自身への関連は作れません",
    });
    expect(
      failed(
        sample,
        ops({ op: "add-loop", id: "p_growth", through: ["staff", "sales", "profit", "hiring"] }),
      ),
    ).toMatchObject({ message: 'ループ "p_growth" は既にあります' });
    expect(failed(sample, ops({ op: "add-loop", through: ["staff", "profit"] }))).toMatchObject({
      message: '"staff" から "profit" への関連がありません',
    });
  });

  it("同じ変数を 2 回通るループは断る", () => {
    const sample = createSampleDiagram();
    const result = applyOperations(
      sample,
      ops(
        { op: "add-link", from: "profit", to: "staff" },
        { op: "add-loop", through: ["staff", "sales", "profit", "staff", "sales", "profit"] },
      ),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { index: 1, message: "同じ変数を 2 回通っています" },
    });
  });

  it("既にある同じループを足しても増やさず、同じ ID を返す", () => {
    const result = applied(
      createSampleDiagram(),
      ops({ op: "add-loop", through: ["sales", "profit", "hiring", "staff"], name: "別名" }),
    );
    expect(result.ids).toEqual(["p_growth"]);
    expect(result.diagram.loops).toHaveLength(3);
  });

  it("ID を省いた関連の ID が既にあれば、番号を付ける", () => {
    const sample = createSampleDiagram();
    const result = applied(
      sample,
      ops(
        { op: "add-variable", id: "a", label: "a" },
        { op: "add-variable", id: "b", label: "b" },
        { op: "add-variable", id: "a_b", label: "ab" },
        { op: "add-link", id: "a_b", from: "a", to: "a_b" },
        { op: "add-link", from: "a", to: "b" },
      ),
    );
    expect(result.ids.at(-1)).toBe("a_b_2");
  });

  it("途中で失敗したら、元の図を変えない", () => {
    const sample = createSampleDiagram();
    const before = JSON.stringify(sample);
    failed(
      sample,
      ops({ op: "remove-variable", id: "staff" }, { op: "add-link", from: "staff", to: "sales" }),
    );
    expect(JSON.stringify(sample)).toBe(before);
  });
});
