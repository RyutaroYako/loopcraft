import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { createWorkspace, writeSample } from "../testing/fixtures.ts";
import { render } from "./render.ts";

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
    await render("diagram.json", { ...options, output: "real.png", scale: 1 }, context);
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
