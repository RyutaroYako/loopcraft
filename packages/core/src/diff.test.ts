import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { diffDiagrams } from "./diff.ts";
import { applyOperations, parseOperation } from "./operations.ts";
import { createSampleDiagram } from "./sample.ts";
import { DiagramSchema } from "./schema.ts";
import type { Diagram } from "./schema.ts";

const edited = (diagram: Diagram, ...items: unknown[]) => {
  const operations = items.map((item) => {
    const parsed = parseOperation(item);
    if (!parsed.ok) throw new Error(parsed.message);
    return parsed.operation;
  });
  const result = applyOperations(diagram, operations);
  if (!result.ok) throw new Error(result.error.message);
  return result.diagram;
};

describe("diffDiagrams", () => {
  it("同じ図なら違いは無い", () => {
    const diagram = createSampleDiagram();
    expect(diffDiagrams(diagram, diagram)).toMatchObject({ changed: false });
  });

  it("変数・関連・ループの増減と、極性で種類が変わったループを挙げる", () => {
    const before = createSampleDiagram();
    const after = edited(
      before,
      { op: "set-title", title: "新しい題" },
      { op: "add-variable", id: "cs", label: "顧客満足度" },
      { op: "add-link", from: "workload", to: "cs", polarity: "-" },
      { op: "add-link", from: "cs", to: "sales", polarity: "+" },
      { op: "add-loop", through: ["workload", "cs", "sales"], name: "サービス品質" },
      { op: "update-variable", id: "profit", label: "営業利益", position: { x: 9, y: 9 } },
      { op: "update-link", id: "l_leave", delay: true },
      { op: "update-link", id: "l_cost", polarity: "+" },
      { op: "remove-variable", id: "attrition" },
    );
    const result = diffDiagrams(before, after);
    expect(result.changed).toBe(true);
    expect(result.title).toEqual({ before: "組織の成長と人の負荷", after: "新しい題" });
    expect(result.variables).toEqual({
      added: [{ id: "cs", label: "顧客満足度" }],
      removed: [{ id: "attrition", label: "離職数" }],
      renamed: [{ id: "profit", before: "利益", after: "営業利益" }],
      moved: 1,
    });
    expect(result.links.added.map((link) => `${link.from}→${link.to}`)).toEqual([
      "一人あたりの業務量→顧客満足度",
      "顧客満足度→売上",
    ]);
    expect(result.links.removed.map((link) => link.id)).toEqual(["l_burnout", "l_leave"]);
    expect(result.links.changed).toEqual([
      {
        id: "l_cost",
        from: "教育コスト",
        to: "営業利益",
        polarity: "+",
        changes: ["polarity: - -> +"],
      },
    ]);
    expect(result.loops.added).toEqual([
      { kind: "B", route: ["売上", "一人あたりの業務量", "顧客満足度"] },
      {
        kind: "R",
        route: ["社員数", "一人あたりの業務量", "顧客満足度", "売上", "営業利益", "採用数"],
      },
    ]);
    expect(result.loops.removed).toEqual([
      { kind: "R", route: ["社員数", "一人あたりの業務量", "離職数"] },
      { kind: "B", route: ["社員数", "売上", "一人あたりの業務量", "離職数"] },
    ]);
    expect(result.loops.flipped).toEqual([
      { kind: "R", before: "B", route: ["社員数", "教育コスト", "営業利益", "採用数"] },
    ]);
    expect(result.featured).toEqual({
      added: ["サービス品質"],
      removed: ["負荷と離職の悪循環"],
    });
  });

  it("遅れの有無の変化を挙げる", () => {
    const before = createSampleDiagram();
    const after = edited(before, { op: "update-link", id: "l_hire", delay: false });
    expect(diffDiagrams(before, after).links.changed).toEqual([
      expect.objectContaining({ id: "l_hire", changes: ["delay: true -> false"] }),
    ]);
  });

  it("説明・曲がり具合・ループ記号の変更も、違いとして場所を挙げる", () => {
    const before = createSampleDiagram();
    const after = edited(
      before,
      { op: "set-description", description: "新" },
      { op: "update-variable", id: "sales", description: "d" },
      { op: "update-link", id: "l_sales", curvature: 0.3 },
      { op: "update-loop", id: "p_growth", description: "d" },
    );
    expect(diffDiagrams(before, after)).toMatchObject({
      changed: true,
      other: [
        "description",
        "variables.sales.description",
        "links.l_sales.curvature",
        "loops.p_growth.description",
      ],
    });
  });

  it("同じ名前の注目するループの片方を消しても、違いとして挙げる", () => {
    const before = edited(createSampleDiagram(), {
      op: "update-loop",
      id: "p_training",
      name: "成長エンジン",
    });
    const after = edited(before, { op: "remove-loop", id: "p_training" });
    expect(diffDiagrams(before, after)).toMatchObject({
      changed: true,
      featured: { added: [], removed: ["成長エンジン"] },
    });
    const renamed = edited(before, { op: "update-loop", id: "p_growth", name: "伸び" });
    expect(diffDiagrams(before, renamed).other).toEqual(["loops.p_growth.name"]);
  });

  it("ループを数えきれなかったら、増減が不完全かもしれないと知らせる", () => {
    const names = ["a", "b", "c", "d", "e", "f", "g"];
    const dense = v.parse(DiagramSchema, {
      version: 1,
      title: "",
      variables: names.map((id, at) => ({ id, label: id, position: { x: at * 100, y: 0 } })),
      links: names.flatMap((from) =>
        names
          .filter((to) => to !== from)
          .map((to) => ({ id: `${from}${to}`, from, to, polarity: "+" })),
      ),
      loops: [],
    });
    expect(diffDiagrams(dense, dense).loops.truncated).toBe(true);
    const sample = createSampleDiagram();
    expect(diffDiagrams(sample, sample).loops.truncated).toBe(false);
  });
});
