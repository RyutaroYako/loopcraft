import { describe, expect, it } from "vite-plus/test";
import { estimateNodeSizes } from "./geometry.ts";
import { renderSvg } from "./render.ts";
import { createSampleDiagram } from "./sample.ts";
import type { Diagram } from "./schema.ts";

const render = (diagram: Diagram, theme?: "light" | "dark") =>
  renderSvg(diagram, estimateNodeSizes(diagram.variables), theme ? { theme } : {});

describe("renderSvg", () => {
  it("変数・関連・注目するループを、図全体が入る大きさで描く", () => {
    const diagram = createSampleDiagram();
    const { svg, width, height } = render(diagram);
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="-?\d+ -?\d+ \d+ \d+"/,
    );
    expect(svg).toContain(`width="${width}" height="${height}"`);
    for (const variable of diagram.variables) expect(svg).toContain(`>${variable.label}</text>`);
    expect(svg.match(/data-link-id=/g)).toHaveLength(diagram.links.length);
    expect(svg.match(/data-loop-id=/g)).toHaveLength(diagram.loops.length);
    expect(svg).toContain(">−</text>");
    expect(svg).toContain(">成長エンジン</text>");
    expect(svg).toContain(">R1</text>");
  });

  it("遅れの印を描き、名前の無い変数は名称未設定と描き、文字をエスケープする", () => {
    const diagram = createSampleDiagram();
    diagram.title = "<a & b>";
    diagram.variables[0]!.label = "";
    const { svg } = render(diagram);
    expect(svg).toContain("<title>&lt;a &amp; b&gt;</title>");
    expect(svg).toContain('font-style="italic">名称未設定</text>');
    expect(svg.match(/stroke-linecap="round"\/>/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it("ダークの配色で描ける", () => {
    expect(render(createSampleDiagram(), "dark").svg).toContain('fill="#0e151c"');
  });

  it("空の図も描ける", () => {
    const diagram: Diagram = { version: 1, title: "", variables: [], links: [], loops: [] };
    expect(render(diagram)).toMatchObject({ width: 96, height: 96 });
  });

  it("曲げた矢印と極性の印も、画像の範囲に入れる", () => {
    const diagram: Diagram = {
      version: 1,
      title: "",
      variables: [
        { id: "a" as never, label: "a", position: { x: 0, y: 0 } },
        { id: "b" as never, label: "b", position: { x: 300, y: 0 } },
      ],
      links: [
        { id: "ab" as never, from: "a" as never, to: "b" as never, polarity: "+", curvature: 0.4 },
      ],
      loops: [],
    };
    const { svg } = render(diagram);
    const [, minY] = /viewBox="(-?\d+) (-?\d+)/.exec(svg)!.slice(1).map(Number);
    expect(minY).toBeLessThan(-240);
  });
});
