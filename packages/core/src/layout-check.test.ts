import { describe, expect, it } from "vite-plus/test";
import { estimateNodeSizes } from "./geometry.ts";
import { findLayoutIssues } from "./layout-check.ts";
import { createSampleDiagram } from "./sample.ts";
import type { Diagram, LinkId, LoopId, VariableId } from "./schema.ts";

const issuesOf = (diagram: Diagram) =>
  findLayoutIssues(diagram, estimateNodeSizes(diagram.variables));

const line = (): Diagram => ({
  version: 1,
  title: "",
  variables: [
    { id: "a" as VariableId, label: "左", position: { x: 0, y: 0 } },
    { id: "b" as VariableId, label: "真ん中", position: { x: 200, y: 0 } },
    { id: "c" as VariableId, label: "右", position: { x: 400, y: 0 } },
  ],
  links: [{ id: "ac" as LinkId, from: "a" as VariableId, to: "c" as VariableId, polarity: "+" }],
  loops: [],
});

describe("findLayoutIssues", () => {
  it("整った図には何も挙げない", () => {
    expect(issuesOf(createSampleDiagram())).toEqual([]);
  });

  it("重なった変数を、重なりの大きさと直し方つきで挙げる", () => {
    const diagram = line();
    diagram.variables[1]!.position = { x: 10, y: 5 };
    expect(issuesOf(diagram)).toContainEqual({
      kind: "overlap",
      severity: "error",
      message: '"左" と "真ん中" が重なっています（横 63px・縦 31px）',
      hint: "loopcraft layout --all で並べ直すか、どちらかの position をずらしてください",
      variables: ["a", "b"],
    });
  });

  it("変数を突き抜ける矢印を挙げ、曲げれば挙げない", () => {
    const diagram = line();
    expect(issuesOf(diagram)).toEqual([
      expect.objectContaining({
        kind: "link-through",
        severity: "error",
        variables: ["b"],
        links: ["ac"],
      }),
    ]);
    diagram.links[0]!.curvature = 0.3;
    expect(issuesOf(diagram).filter((issue) => issue.kind === "link-through")).toEqual([]);
  });

  it("端を共有しない矢印の交差と、重なった極性の印を warning にする", () => {
    const diagram: Diagram = {
      version: 1,
      title: "",
      variables: [
        { id: "a" as VariableId, label: "a", position: { x: 0, y: 0 } },
        { id: "b" as VariableId, label: "b", position: { x: 300, y: 300 } },
        { id: "c" as VariableId, label: "c", position: { x: 300, y: 0 } },
        { id: "d" as VariableId, label: "d", position: { x: 0, y: 300 } },
      ],
      links: [
        { id: "ab" as LinkId, from: "a" as VariableId, to: "b" as VariableId, polarity: "+" },
        { id: "cd" as LinkId, from: "c" as VariableId, to: "d" as VariableId, polarity: "-" },
      ],
      loops: [],
    };
    const issues = issuesOf(diagram);
    expect(issues).toContainEqual(
      expect.objectContaining({ kind: "crossing", severity: "warning", links: ["ab", "cd"] }),
    );
    const near: Diagram = {
      ...diagram,
      variables: [
        ...diagram.variables,
        { id: "e" as VariableId, label: "e", position: { x: 244, y: 236 } },
      ],
    };
    expect(issuesOf(near)).toContainEqual(
      expect.objectContaining({ kind: "label-overlap", variables: ["e"], links: ["ab"] }),
    );
  });

  it("ほかの矢印の極性の印と重なる印を挙げる", () => {
    const diagram: Diagram = {
      version: 1,
      title: "",
      variables: [
        { id: "a" as VariableId, label: "a", position: { x: 0, y: 0 } },
        { id: "b" as VariableId, label: "b", position: { x: 300, y: 0 } },
        { id: "c" as VariableId, label: "c", position: { x: 0, y: 10 } },
        { id: "d" as VariableId, label: "d", position: { x: 300, y: 10 } },
      ],
      links: [
        { id: "ab" as LinkId, from: "a" as VariableId, to: "b" as VariableId, polarity: "+" },
        { id: "cd" as LinkId, from: "c" as VariableId, to: "d" as VariableId, polarity: "+" },
      ],
      loops: [],
    };
    expect(issuesOf(diagram)).toContainEqual(
      expect.objectContaining({ kind: "label-overlap", links: ["ab", "cd"] }),
    );
  });

  it("変数に重なったループの記号を挙げる", () => {
    const sample = createSampleDiagram();
    const diagram: Diagram = {
      ...sample,
      loops: [{ ...sample.loops[0]!, id: "p" as LoopId, marker: { x: 0, y: 0 } }],
    };
    expect(issuesOf(diagram)).toContainEqual(
      expect.objectContaining({ kind: "marker-overlap", loops: ["p"], variables: ["staff"] }),
    );
  });
});
