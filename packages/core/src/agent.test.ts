import { describe, expect, it } from "vite-plus/test";
import { changesOf, touchedBy } from "./agent.ts";
import { diffDiagrams } from "./diff.ts";
import { applyOperations } from "./operations.ts";
import { createSampleDiagram } from "./sample.ts";

describe("changesOf", () => {
  it("差分を、画面に並べる変更の行に直し、足したり変えたりした要素を挙げる", () => {
    const before = createSampleDiagram();
    const applied = applyOperations(before, [
      { op: "set-title", title: "新しい題名" },
      { op: "add-variable", id: "meetings", label: "面談の回数" },
      { op: "add-link", id: "l_meet", from: "attrition", to: "meetings", polarity: "+" },
      { op: "update-variable", id: "sales", label: "月の売上" },
      { op: "update-link", id: "l_leave", polarity: "+" },
      { op: "remove-link", id: "l_cost" },
    ]);
    if (!applied.ok) throw new Error(applied.error.message);
    const diff = diffDiagrams(before, applied.diagram);
    expect(changesOf(diff)).toEqual([
      { kind: "title-changed", title: "新しい題名" },
      { kind: "variable-added", label: "面談の回数" },
      { kind: "variable-renamed", before: "売上", after: "月の売上" },
      { kind: "link-added", from: "離職数", to: "面談の回数", polarity: "+" },
      { kind: "link-changed", from: "離職数", to: "社員数", polarity: "+" },
      { kind: "link-removed", from: "教育コスト", to: "利益", polarity: "-" },
      ...diff.featured.removed.map((name) => ({ kind: "loop-unfeatured", name })),
      ...(diff.other.length > 0 ? [{ kind: "details-changed", count: diff.other.length }] : []),
    ]);
    expect(touchedBy(diff)).toEqual({
      variables: ["meetings", "sales"],
      links: ["l_meet", "l_leave"],
    });
  });
});
