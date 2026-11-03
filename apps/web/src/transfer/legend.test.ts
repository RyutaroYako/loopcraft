import { listLoopEntries } from "@loopcraft/core/loops";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { describe, expect, it } from "vite-plus/test";
import { LEGEND_METRICS, hasLegendText, layoutLegend, legendItemsOf, wrapText } from "./legend.ts";

/** 1 文字を 10px と数える */
const measure = (text: string) => text.length * 10;

describe("legendItemsOf", () => {
  it("注目するループだけを、名前・種類・説明と並べる", () => {
    const diagram = createSampleDiagram();
    const items = legendItemsOf(listLoopEntries(diagram.loops, diagram.links, []));
    expect(items.map((item) => [item.badge, item.name, item.kindText])).toEqual([
      ["R1", "成長エンジン", "自己強化ループ"],
      ["B1", "育成の負担", "バランスループ"],
      ["R2", "負荷と離職の悪循環", "自己強化ループ"],
    ]);
    expect(items[0]!.description).toMatch(/さらに人を採れる/);
    expect(hasLegendText(items)).toBe(true);
    expect(hasLegendText(items.map((item) => ({ ...item, description: undefined })))).toBe(false);
  });
});

describe("wrapText", () => {
  it("空白の無い日本語も幅で折り、折り目の空白は行頭に残さない", () => {
    expect(wrapText("あいうえおかきくけこ", 40, measure)).toEqual(["あいうえ", "おかきく", "けこ"]);
    expect(wrapText("abcd efgh", 40, measure)).toEqual(["abcd", "efgh"]);
    expect(wrapText("", 40, measure)).toEqual([]);
  });
});

describe("layoutLegend", () => {
  it("狭い図でも最小の幅を取り、説明の行数に応じて行を下げる", () => {
    const m = LEGEND_METRICS;
    const items = [
      { badge: "R1", kind: "reinforcing" as const, name: "a", kindText: "k", description: "x" },
      { badge: "B1", kind: "balancing" as const, name: "b", kindText: "k" },
    ];
    const layout = layoutLegend(items, 100, measure);
    expect(layout.width).toBe(m.minWidth);
    expect(layout.rows.map((row) => row.lines)).toEqual([["x"], []]);
    expect(layout.rows[0]!.y).toBe(m.padding);
    const firstHeight = m.titleSize * m.textLineHeight + m.titleGap + m.textSize * m.textLineHeight;
    expect(layout.rows[1]!.y).toBe(m.padding + firstHeight + m.rowGap);
    expect(layout.height).toBe(layout.rows[1]!.y + m.badge + m.padding);
  });
});
