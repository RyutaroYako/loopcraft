import { writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { estimateNodeSizes } from "@loopcraft/core/geometry";
import { renderSvg } from "@loopcraft/core/render";
import type { Theme } from "@loopcraft/core/render";
import type { Context } from "../context.ts";
import { isFailure, loadDiagram, locate } from "../load.ts";
import { done, failure, usageError } from "../outcome.ts";
import type { Outcome } from "../outcome.ts";
import { printData } from "../output.ts";

export interface RenderOptions {
  format: "text" | "json";
  output?: string;
  theme: Theme;
  scale: number;
}

export interface RenderDependencies {
  svgToPng?: (svg: string, scale: number) => Promise<Uint8Array>;
}

export async function render(
  file: string,
  options: RenderOptions,
  context: Context,
  dependencies: RenderDependencies = {},
): Promise<Outcome> {
  const { log } = context;
  const kind = options.output ? extname(options.output).toLowerCase() : ".svg";
  if (kind !== ".svg" && kind !== ".png") {
    return usageError("-o の拡張子は .svg か .png にしてください", {
      suggestions: [`loopcraft render ${file} -o ${file.replace(/\.json$/, "")}.png`],
    });
  }
  const loaded = await loadDiagram(file, context);
  if (isFailure(loaded)) return loaded;
  const { svg, width, height } = renderSvg(
    loaded.diagram,
    estimateNodeSizes(loaded.diagram.variables),
    { theme: options.theme },
  );

  if (!options.output) {
    if (options.format === "json") printData(log, { format: "svg", width, height, svg });
    else log.output(svg.trimEnd());
    return done;
  }
  const target = locate(options.output, context);
  if (kind === ".png") {
    const convert = dependencies.svgToPng ?? svgToPng;
    let png: Uint8Array;
    try {
      png = await convert(svg, options.scale);
    } catch (error) {
      return failure(`PNG にできませんでした（${String(error)}）`, {
        code: "PNG_FAILED",
        suggestions: [
          `loopcraft render ${loaded.shown} -o ${target.shown.replace(/\.png$/i, ".svg")}`,
          "フォントが足りないときは、図の文字を含むフォント（日本語なら fonts-noto-cjk など）を入れてください",
        ],
      });
    }
    await writeFile(target.path, png);
  } else {
    await writeFile(target.path, svg, "utf8");
  }
  const scale = kind === ".png" ? options.scale : 1;
  const size = { width: width * scale, height: height * scale };
  if (options.format === "json") {
    printData(log, { file: target.shown, format: kind.slice(1), ...size });
  } else {
    log.success(`${target.shown} に書き出しました（${size.width}×${size.height}）`);
  }
  return done;
}

/**
 * resvg を必要になるまで読み込まないのは、ほかのコマンドの起動を遅くしないため。
 * ブラウザで描かないのは、CLI を動かす環境にブラウザがあるとは限らないため
 */
async function svgToPng(svg: string, scale: number): Promise<Uint8Array> {
  const { Resvg } = await import("@resvg/resvg-js");
  const font = { loadSystemFonts: true, defaultFontFamily: "Noto Sans CJK JP" };
  const unreadable = findUnreadable(
    charactersIn(svg),
    (probe) => new Resvg(probe, { font }).render().pixels,
  );
  if (unreadable.length > 0) {
    throw new Error(`「${unreadable.slice(0, 5).join("")}」を描けるフォントが見つかりません`);
  }
  return new Resvg(svg, { fitTo: { mode: "zoom", value: scale }, font }).render().asPng();
}

const CELL = 24;

/**
 * 確かめずに描かないのは、字形が無くても resvg は失敗せず、文字が空白か豆腐（□）の画像を返すため。
 * 決まった文字で確かめないのは、図に無い文字のフォントが無いだけで、描ける図まで断ってしまうため。
 * 1 文字ずつ描かないのは、描くたびにシステムのフォントを読み直し、文字の多い図で数秒かかるため
 */
export function findUnreadable(chars: readonly string[], draw: (svg: string) => Uint8Array) {
  if (chars.length === 0) return [];
  // 最後の升目は、どのフォントにも無い私用領域の文字。これと同じ形に描かれたら字形が無いとみなす
  const cells = [...chars, "\uE000"];
  const width = cells.length * CELL;
  const texts = cells
    .map((char, at) => `<text x="${at * CELL + 2}" y="18" font-size="16">${escapeXml(char)}</text>`)
    .join("");
  const pixels = draw(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${CELL}">${texts}</svg>`,
  );
  const cell = (at: number) =>
    Array.from({ length: CELL }, (_, row) => {
      const start = (row * width + at * CELL) * 4;
      return pixels.subarray(start, start + CELL * 4);
    });
  const missing = cell(chars.length);
  return chars.filter((_, at) => {
    const rows = cell(at);
    const blank = rows.every((row) => row.every((value, index) => index % 4 !== 3 || value === 0));
    const same = rows.every((row, y) => row.every((value, x) => value === missing[y]![x]));
    return blank || same;
  });
}

/** 既定で無視される文字や結合文字を除くのは、単独では何も描かれず、フォントがあっても無いと見誤るため */
export function charactersIn(svg: string) {
  const texts = [...svg.matchAll(/>([^<]*)<\/text>/g)].map((match) =>
    match[1]!
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&amp;", "&"),
  );
  return [...new Set(texts.join(""))].filter(
    (char) => char.trim() !== "" && !/\p{Default_Ignorable_Code_Point}|\p{M}/u.test(char),
  );
}

function escapeXml(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
