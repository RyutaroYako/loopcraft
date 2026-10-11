import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { createEmptyDiagram, parseDiagramJson, stringifyDiagram } from "./io.ts";
import { DiagramSchema } from "./schema.ts";
import { createSampleInput as createSample } from "./testing/sample.ts";

function issuesOf(input: unknown) {
  const result = v.safeParse(DiagramSchema, input);
  return result.success ? {} : v.flatten<typeof DiagramSchema>(result.issues).nested;
}

describe("DiagramSchema", () => {
  it("整合した図を受け入れる", () => {
    expect(issuesOf(createSample())).toEqual({});
  });

  it("空の図を作れる", () => {
    expect(createEmptyDiagram().variables).toEqual([]);
  });

  it("極性は + か - に限る", () => {
    const sample = createSample();
    Object.assign(sample.links[0]!, { polarity: "plus" });
    expect(issuesOf(sample)).toHaveProperty(["links.0.polarity"]);
  });

  it("コレクション内の ID 重複を検出する", () => {
    const sample = createSample();
    sample.variables[1]!.id = "staff";
    expect(issuesOf(sample)).toHaveProperty(["variables.1.id"], [`ID "staff" が重複しています`]);
  });

  it("存在しない出来事への関連を検出する", () => {
    const sample = createSample();
    sample.links[0]!.to = "ghost";
    expect(issuesOf(sample)).toHaveProperty(["links.0.to"]);
  });

  it("自己ループと同じ向きの関連の重複を検出する", () => {
    const sample = createSample();
    sample.links.push(
      { id: "self", from: "staff", to: "staff", polarity: "+" },
      { id: "dup", from: "staff", to: "training", polarity: "-" },
    );
    const issues = issuesOf(sample);
    expect(issues).toHaveProperty(["links.6.to"]);
    expect(issues).toHaveProperty(["links.7"]);
  });

  it("繋がっていないループを検出する", () => {
    const sample = createSample();
    sample.loops[0]!.links = ["l1", "l3", "l4"];
    expect(issuesOf(sample)).toHaveProperty(["loops.0.links.0"]);
  });

  it("同じ出来事を 2 回通るループを検出する", () => {
    const sample = createSample();
    sample.links.push(
      { id: "x1", from: "training", to: "staff", polarity: "+" },
      { id: "x2", from: "sales", to: "staff", polarity: "+" },
    );
    // staff → training → staff → sales → staff
    sample.loops[0]!.links = ["l1", "x1", "l5", "x2"];
    expect(issuesOf(sample)).toHaveProperty(["loops.0.links.2"]);
  });

  it("回転しただけの同じループの重複登録を検出する", () => {
    const sample = createSample();
    sample.loops.push({ id: "b2", name: "別名", links: ["l3", "l4", "l1", "l2"] });
    expect(issuesOf(sample)).toHaveProperty(["loops.2.links"]);
  });
});

describe("parseDiagramJson", () => {
  it("書き出した JSON をそのまま読み戻せる", () => {
    const diagram = v.parse(DiagramSchema, createSample());
    expect(parseDiagramJson(stringifyDiagram(diagram))).toEqual({ ok: true, diagram });
  });

  it("壊れた JSON はエラーとして返す", () => {
    const result = parseDiagramJson("{");
    expect(result.ok).toBe(false);
  });

  it("エラーの場所をドット区切りで返す", () => {
    const sample = createSample();
    sample.links[2]!.from = "ghost";
    const result = parseDiagramJson(JSON.stringify(sample));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.path)).toContain("links.2.from");
    }
  });
});
