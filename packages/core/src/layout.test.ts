import { describe, expect, it } from "vite-plus/test";
import { estimateNodeSizes, nodeSize } from "./geometry.ts";
import type { Size } from "./geometry.ts";
import { autoLayout, placeMissingVariables } from "./layout.ts";
import { findLayoutIssues } from "./layout-check.ts";
import { createSampleDiagram } from "./sample.ts";
import type { Diagram, DiagramShape, LinkId, VariableId } from "./schema.ts";

const sizesOf = (diagram: Diagram): Map<VariableId, Size> => {
  return new Map(
    diagram.variables.map((variable) => [variable.id, nodeSize(variable.label.length * 14)]),
  );
};

const stacked = (): Diagram => {
  const sample = createSampleDiagram();
  return {
    ...sample,
    variables: sample.variables.map((variable) => ({ ...variable, position: { x: 0, y: 0 } })),
  };
};

describe("autoLayout", () => {
  it("変数の枠が重ならないように配置する", () => {
    const diagram = stacked();
    const sizes = sizesOf(diagram);
    const result = autoLayout(diagram, sizes);
    const boxes = result.variables.map((variable) => ({
      ...variable.position,
      ...sizes.get(variable.id)!,
    }));
    for (const [index, a] of boxes.entries()) {
      for (const b of boxes.slice(index + 1)) {
        const apartX = Math.abs(a.x - b.x) >= (a.width + b.width) / 2;
        const apartY = Math.abs(a.y - b.y) >= (a.height + b.height) / 2;
        expect(apartX || apartY).toBe(true);
      }
    }
  });

  it("同じ図からは毎回同じ配置になり、重心は動かさない", () => {
    const diagram = createSampleDiagram();
    const sizes = sizesOf(diagram);
    const first = autoLayout(diagram, sizes);
    expect(autoLayout(diagram, sizes)).toEqual(first);
    const center = (target: Diagram) => {
      const xs = target.variables.map((variable) => variable.position.x);
      const ys = target.variables.map((variable) => variable.position.y);
      return {
        x: xs.reduce((sum, x) => sum + x, 0) / xs.length,
        y: ys.reduce((sum, y) => sum + y, 0) / ys.length,
      };
    };
    expect(center(first).x).toBeCloseTo(center(diagram).x, 0);
    expect(center(first).y).toBeCloseTo(center(diagram).y, 0);
  });

  it("手で付けた曲がり具合を既定に戻し、ループ記号を変数から離して置き直す", () => {
    const sample = createSampleDiagram();
    const diagram: Diagram = {
      ...sample,
      links: sample.links.map((link) => ({ ...link, curvature: 0.4 })),
      loops: sample.loops.map((loop) => ({ ...loop, marker: { x: 1, y: 2 } })),
    };
    const sizes = sizesOf(diagram);
    const result = autoLayout(diagram, sizes);
    expect(result.links.every((link) => !("curvature" in link))).toBe(true);
    for (const loop of result.loops) {
      const marker = loop.marker!;
      expect(marker).not.toEqual({ x: 1, y: 2 });
      for (const variable of result.variables) {
        const size = sizes.get(variable.id)!;
        const dx = Math.abs(marker.x - variable.position.x) - size.width / 2;
        const dy = Math.abs(marker.y - variable.position.y) - size.height / 2;
        // 記号の半径 26 より離れている
        expect(Math.max(dx, dy)).toBeGreaterThan(26);
      }
    }
  });

  it("整列済みの図をもう一度整列しても、何も変えない", () => {
    const diagram = createSampleDiagram();
    const sizes = sizesOf(diagram);
    const once = autoLayout(diagram, sizes);
    expect(autoLayout(once, sizes)).toBe(once);
  });

  it("大きさの分からない変数は名前が空のときの大きさとみなし、変数が 1 つなら重心に置く", () => {
    const sample = createSampleDiagram();
    const single = { ...sample, variables: sample.variables.slice(0, 1), links: [], loops: [] };
    const result = autoLayout(single, new Map());
    expect(result.variables[0]!.position).toEqual(single.variables[0]!.position);
    expect(autoLayout(stacked(), new Map()).variables).toHaveLength(sample.variables.length);
  });

  it("ばねだけでは離しきれない大きな変数も、縦横どちらへも押し広げて重ならないようにする", () => {
    const diagram = createSampleDiagram();
    for (const size of [
      { width: 900, height: 36 },
      { width: 72, height: 2000 },
    ]) {
      const result = autoLayout(diagram, new Map(diagram.variables.map((item) => [item.id, size])));
      const positions = result.variables.map((variable) => variable.position);
      for (const [index, p] of positions.entries()) {
        for (const q of positions.slice(index + 1)) {
          const apart = Math.abs(p.x - q.x) >= size.width || Math.abs(p.y - q.y) >= size.height;
          expect(apart).toBe(true);
        }
      }
    }
  });

  it("逆向きの関連があっても配置できる", () => {
    const sample = createSampleDiagram();
    const first = sample.links[0]!;
    const reversed = { ...first, id: "reverse" as LinkId, from: first.to, to: first.from };
    const diagram = { ...sample, links: [...sample.links, reversed] };
    const result = autoLayout(diagram, sizesOf(diagram));
    expect(result.loops.every((loop) => loop.marker !== undefined)).toBe(true);
  });

  it("空の図はそのまま返す", () => {
    const diagram = { ...createSampleDiagram(), variables: [], links: [], loops: [] };
    expect(autoLayout(diagram, new Map())).toBe(diagram);
  });

  it("動かさない変数を指定すると、その変数の位置と、その変数どうしの曲がり具合を保つ", () => {
    const sample = createSampleDiagram();
    const diagram: Diagram = {
      ...sample,
      links: sample.links.map((link) => ({ ...link, curvature: 0.3 })),
    };
    const fixed = new Set(["staff", "sales", "profit"] as VariableId[]);
    const result = autoLayout(diagram, sizesOf(diagram), { fixed });
    for (const variable of diagram.variables.filter((item) => fixed.has(item.id))) {
      expect(result.variables.find((item) => item.id === variable.id)!.position).toEqual(
        variable.position,
      );
    }
    const between = result.links.find((link) => link.from === "staff" && link.to === "sales")!;
    expect(between.curvature).toBe(0.3);
    const touching = result.links.find((link) => link.from === "profit" && link.to === "hiring")!;
    expect(touching.curvature).toBeUndefined();
  });

  it("すべて動かさないなら、何も変えない", () => {
    const diagram = createSampleDiagram();
    const fixed = new Set(diagram.variables.map((variable) => variable.id));
    expect(autoLayout(diagram, sizesOf(diagram), { fixed })).toBe(diagram);
  });
});

describe("placeMissingVariables", () => {
  const withoutPositions = (ids: string[]): DiagramShape => {
    const sample = createSampleDiagram();
    return {
      ...sample,
      variables: sample.variables.map(({ position, ...variable }) =>
        ids.includes(variable.id) ? variable : { ...variable, position },
      ),
    };
  };

  it("座標の無い変数だけを、ほかの変数と重ならないように置く", () => {
    const shape = withoutPositions(["hiring", "attrition"]);
    const result = placeMissingVariables(shape);
    const sizes = estimateNodeSizes(result.variables);
    for (const variable of shape.variables.filter((item) => item.position)) {
      expect(result.variables.find((item) => item.id === variable.id)!.position).toEqual(
        variable.position,
      );
    }
    expect(findLayoutIssues(result, sizes).filter((issue) => issue.kind === "overlap")).toEqual([]);
  });

  it("どの変数にも座標が無ければ、図全体を並べる", () => {
    const shape = withoutPositions(createSampleDiagram().variables.map((variable) => variable.id));
    const result = placeMissingVariables(shape);
    const sizes = estimateNodeSizes(result.variables);
    expect(findLayoutIssues(result, sizes).filter((issue) => issue.severity === "error")).toEqual(
      [],
    );
    expect(placeMissingVariables(shape)).toEqual(result);
  });

  it("座標がそろっていれば、そのまま返す", () => {
    const diagram = createSampleDiagram();
    expect(placeMissingVariables(diagram)).toEqual(diagram);
  });
});
