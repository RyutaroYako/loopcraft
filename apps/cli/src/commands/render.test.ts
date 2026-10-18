import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { createWorkspace, writeSample } from "../testing/fixtures.ts";
import { charactersIn, findUnreadable, render } from "./render.ts";

const options = { format: "text" as const, theme: "light" as const, scale: 2 };

describe("render", () => {
  it("-o を省くと SVG を標準出力に出す", async () => {
    const { context, stdout } = await createWorkspace();
    await writeSample(context.cwd);
    await render("diagram.json", options, context);
    expect(stdout.join("\n")).toMatch(/^<svg [^]*<\/svg>$/);
    const json = await createWorkspace();
    await writeSample(json.cwd);
    await render("diagram.json", { ...options, format: "json" }, json.context);
    expect(JSON.parse(json.stdout.join(""))).toMatchObject({
      ok: true,
      data: { format: "svg", svg: expect.stringMatching(/^<svg /) },
    });
  });

  it("SVG と PNG のファイルに書き出す", async () => {
    const { context, stdout, stderr } = await createWorkspace();
    await writeSample(context.cwd);
    await render("diagram.json", { ...options, output: "d.svg" }, context);
    expect(await readFile(join(context.cwd, "d.svg"), "utf8")).toMatch(/^<svg /);
    expect(stderr[0]).toMatch(/^✓ d.svg に書き出しました（\d+×\d+）$/);
    const svgToPng = async (svg: string, scale: number) =>
      new TextEncoder().encode(`${scale}:${svg.length}`);
    await render("diagram.json", { ...options, format: "json", output: "d.png" }, context, {
      svgToPng,
    });
    expect(await readFile(join(context.cwd, "d.png"), "utf8")).toMatch(/^2:\d+$/);
    expect(JSON.parse(stdout.join(""))).toMatchObject({ data: { file: "d.png", format: "png" } });
  });

  it("PNG にできなければ、SVG で書き出す方法を示す", async () => {
    const { context } = await createWorkspace();
    await writeSample(context.cwd);
    const svgToPng = async () => {
      throw new Error("no fonts");
    };
    expect(
      await render("diagram.json", { ...options, output: "d.png" }, context, { svgToPng }),
    ).toMatchObject({
      code: "PNG_FAILED",
      suggestions: expect.arrayContaining(["loopcraft render diagram.json -o d.svg"]),
    });
  });

  it("実際の PNG を作れる", async () => {
    const { context } = await createWorkspace();
    await writeSample(context.cwd);
    expect(
      await render("diagram.json", { ...options, output: "real.png", scale: 1 }, context),
    ).toEqual({ kind: "done" });
    const png = await readFile(join(context.cwd, "real.png"));
    expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
  });

  it("知らない拡張子や無いファイルは断る", async () => {
    const { context } = await createWorkspace();
    expect(await render("d.json", { ...options, output: "d.jpg" }, context)).toMatchObject({
      kind: "usage",
      suggestions: ["loopcraft render d.json -o d.png"],
    });
    expect(await render("none.json", options, context)).toMatchObject({ code: "FILE_NOT_FOUND" });
  });
});

describe("PNG の前の字形の確かめ", () => {
  it("図の文字だけを、目に見えない文字や結合文字を除いて確かめる", () => {
    const svg = "<svg><text>A&amp;B</text><text>\u2600\uFE0F e\u0301</text><text>売</text></svg>";
    expect(charactersIn(svg)).toEqual(["A", "&", "B", "\u2600", "e", "売"]);
  });

  it("空白か、無い文字と同じ形に描かれた文字を挙げる", () => {
    const draw = (svg: string) => {
      const cells = [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((match) => match[1]!);
      const width = cells.length * 24;
      const pixels = new Uint8Array(width * 24 * 4);
      for (const [at, char] of cells.entries()) {
        // A は描け、売は豆腐（無い文字と同じ形）、空は何も描かれない
        const alpha = char === "A" ? 255 : char === "空" ? 0 : 128;
        for (let y = 0; y < 24; y++) pixels[(y * width + at * 24) * 4 + 3] = alpha;
      }
      return pixels;
    };
    expect(findUnreadable(["A", "売", "空"], draw)).toEqual(["売", "空"]);
    expect(findUnreadable([], draw)).toEqual([]);
  });
});
