import { describe, expect, it } from "vite-plus/test";
import { findLoops } from "./cycles.ts";
import { listLoopEntries } from "./loops.ts";
import { createSampleDiagram } from "./sample.ts";
import { createSample } from "./testing/sample.ts";

describe("listLoopEntries", () => {
  it("注目するループを先に、種類ごとの番号付きで並べる", () => {
    const diagram = createSampleDiagram();
    const entries = listLoopEntries(diagram.loops, diagram.links, findLoops(diagram.links).loops);
    expect(entries.map((entry) => entry.featured?.badge ?? entry.kind)).toEqual([
      "R1",
      "B1",
      "R2",
      "balancing",
    ]);
    expect(entries[0]!.variables).toEqual(["staff", "sales", "profit", "hiring"]);
  });

  it("消えた関連を通るループは、出発点を飛ばし極性を + とみなす", () => {
    const sample = createSample();
    const entries = listLoopEntries(sample.loops, sample.links.slice(1), []);
    expect(entries[0]!.variables).toEqual(["training", "profit", "hiring"]);
    expect(entries[0]!.kind).toBe("balancing");
  });
});
