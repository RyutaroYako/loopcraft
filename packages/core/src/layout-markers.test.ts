import { describe, expect, it } from "vite-plus/test";
import { estimateNodeSizes, NODE_HEIGHT, NODE_MIN_WIDTH } from "./geometry.ts";
import { placeMarkers } from "./layout-markers.ts";
import type { Diagram, LinkId, LoopId, VariableId } from "./schema.ts";

const FALLBACK = { width: NODE_MIN_WIDTH, height: NODE_HEIGHT };
const replace = new Set(["p" as LoopId]);

const triangle = (height: number, name: string): Diagram => ({
  version: 1,
  title: "",
  variables: [
    { id: "a" as VariableId, label: "一人あたりの業務量", position: { x: 0, y: 0 } },
    { id: "b" as VariableId, label: "離職数", position: { x: 400, y: 0 } },
    { id: "c" as VariableId, label: "社員数", position: { x: 200, y: height } },
  ],
  links: [
    { id: "ab" as LinkId, from: "a" as VariableId, to: "b" as VariableId, polarity: "+" },
    { id: "bc" as LinkId, from: "b" as VariableId, to: "c" as VariableId, polarity: "-" },
    {
      id: "ca" as LinkId,
      from: "c" as VariableId,
      to: "a" as VariableId,
      polarity: "-",
      curvature: 0.1,
    },
  ],
  loops: [{ id: "p" as LoopId, name, links: ["ab", "bc", "ca"] as LinkId[] }],
});

const clearOfVariables = (diagram: Diagram, at: { x: number; y: number }) => {
  const sizes = estimateNodeSizes(diagram.variables);
  return diagram.variables.every((variable) => {
    const size = sizes.get(variable.id)!;
    const dx = Math.abs(at.x - variable.position.x) - size.width / 2;
    const dy = Math.abs(at.y - variable.position.y) - size.height / 2;
    return Math.max(dx, dy) > 26;
  });
};

describe("placeMarkers", () => {
  it("ループの内の、変数と矢印から離れた所に置く", () => {
    const diagram = triangle(400, "負荷と離職の悪循環");
    const marker = placeMarkers(
      diagram,
      estimateNodeSizes(diagram.variables),
      FALLBACK,
      replace,
    ).get("p" as LoopId)!;
    expect(marker.y).toBeGreaterThan(0);
    expect(marker.y).toBeLessThan(400);
    expect(clearOfVariables(diagram, marker)).toBe(true);
  });

  it("細長くて内に空きが無いループは、外のすぐそばに置く", () => {
    const diagram = triangle(40, "");
    const marker = placeMarkers(
      diagram,
      estimateNodeSizes(diagram.variables),
      FALLBACK,
      replace,
    ).get("p" as LoopId)!;
    expect(clearOfVariables(diagram, marker)).toBe(true);
  });

  it("大きさの分からない変数は、名前が空のときの大きさとみなす", () => {
    const diagram = triangle(400, "");
    expect(placeMarkers(diagram, new Map(), FALLBACK, replace).get("p" as LoopId)).toBeDefined();
  });

  it("置き直さないループの記号は動かさず、その記号を避けて置く", () => {
    const diagram = triangle(400, "");
    const kept = { x: 200, y: 140 };
    const twin: Diagram = {
      ...diagram,
      loops: [{ ...diagram.loops[0]!, id: "q" as LoopId, marker: kept }, ...diagram.loops],
    };
    const markers = placeMarkers(twin, estimateNodeSizes(twin.variables), FALLBACK, replace);
    expect(markers.has("q" as LoopId)).toBe(false);
    const placed = markers.get("p" as LoopId)!;
    expect(Math.hypot(placed.x - kept.x, placed.y - kept.y)).toBeGreaterThan(52);
  });
});
