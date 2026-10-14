import { describe, expect, it } from "vite-plus/test";
import { nodeSize, type Size } from "./geometry.ts";
import { autoLayout } from "./layout.ts";
import { createSampleDiagram } from "./sample.ts";
import type { Diagram, VariableId } from "./schema.ts";

function sizesOf(diagram: Diagram): Map<VariableId, Size> {
  return new Map(
    diagram.variables.map((variable) => [variable.id, nodeSize(variable.label.length * 14)]),
  );
}

/** すべての出来事を同じ位置に重ねた図 */
function stacked(): Diagram {
  const sample = createSampleDiagram();
  return {
    ...sample,
    variables: sample.variables.map((variable) => ({ ...variable, position: { x: 0, y: 0 } })),
  };
}

describe("autoLayout", () => {
  it("出来事の枠が重ならないように配置する", () => {
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

  it("手で付けた曲がり具合を既定に戻し、ループ記号を出来事から離して置き直す", () => {
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

  it("空の図はそのまま返す", () => {
    const diagram = { ...createSampleDiagram(), variables: [], links: [], loops: [] };
    expect(autoLayout(diagram, new Map())).toBe(diagram);
  });
});
