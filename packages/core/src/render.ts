import { findLoops } from "./cycles.ts";
import {
  boundsOf,
  centroid,
  defaultCurvature,
  isClockwise,
  linkGeometry,
  UNNAMED_LABEL,
} from "./geometry.ts";
import type { Size } from "./geometry.ts";
import { delayMarkPath, LOOP_ARC, LOOP_ARROW_HEAD } from "./glyphs.ts";
import { linkPairKey } from "./integrity.ts";
import { listLoopEntries } from "./loops.ts";
import type { Diagram, VariableId } from "./schema.ts";

/**
 * エディタの部品をそのまま描かないのは、Vue と DOM が要り、CLI から使えないため
 */

export type Theme = "light" | "dark";

/** tokens.css を読まないのは、公開した CLI には web のソースが無いため。値はそちらと揃える */
const PALETTE: Record<Theme, Record<string, string>> = {
  light: {
    canvas: "#f8f9fa",
    surface: "#ffffff",
    ink: "#15202b",
    ink2: "#344250",
    faint: "#98a2ad",
    line: "#e1e5e9",
    lineStrong: "#cdd3d9",
    link: "#6b7785",
    glass: "#ffffff",
    accent: "#b9561a",
    negative: "#b42346",
    negativeTint: "#fcf3f5",
  },
  dark: {
    canvas: "#0e151c",
    surface: "#17212b",
    ink: "#e8ecf0",
    ink2: "#c3cbd3",
    faint: "#5e6a76",
    line: "#2a3642",
    lineStrong: "#3a4855",
    link: "#7a8693",
    glass: "#17212b",
    accent: "#f08a3c",
    negative: "#f07a93",
    negativeTint: "#2e1c22",
  },
};

const SANS = `'Geist', 'Hiragino Sans', 'Noto Sans JP', 'Noto Sans CJK JP', 'IPAGothic', 'Yu Gothic', sans-serif`;
const MONO = `'Geist Mono', ui-monospace, 'SFMono-Regular', monospace`;
const PADDING = 48;

export interface RenderedSvg {
  svg: string;
  width: number;
  height: number;
}

export const renderSvg = (
  diagram: Diagram,
  sizes: ReadonlyMap<VariableId, Size>,
  { theme = "light" }: { theme?: Theme } = {},
): RenderedSvg => {
  const color = PALETTE[theme];
  const boxOf = (id: VariableId) => {
    const variable = diagram.variables.find((item) => item.id === id)!;
    return { center: variable.position, size: sizes.get(id) ?? { width: 72, height: 36 } };
  };
  const boxes = diagram.variables.map((variable) => ({ variable, ...boxOf(variable.id) }));
  const pairs = new Set(diagram.links.map((link) => linkPairKey(link.from, link.to)));

  // 変数の枠だけで範囲を決めないのは、曲げた矢印や極性の印が枠の外へ出て、画像から切れるため
  const extents: { center: { x: number; y: number }; size: Size }[] = [];
  const links = diagram.links.map((link) => {
    const curvature =
      link.curvature ?? defaultCurvature(pairs.has(linkPairKey(link.to, link.from)));
    const geometry = linkGeometry(boxOf(link.from), boxOf(link.to), curvature);
    for (const point of [geometry.start, geometry.control, geometry.end]) {
      extents.push({ center: point, size: { width: 0, height: 0 } });
    }
    extents.push({ center: geometry.label, size: { width: 24, height: 24 } });
    const negative = link.polarity === "-";
    const delay = link.delay
      ? `<path d="${delayMarkPath(geometry.middle, geometry.tangent)}" fill="none" stroke="${color.ink2}" stroke-width="1.5" stroke-linecap="round"/>`
      : "";
    return [
      `<g data-link-id="${escape(link.id)}">`,
      `<path d="${geometry.path}" fill="none" stroke="${color.link}" stroke-width="1.5" marker-end="url(#arrowhead)"/>`,
      delay,
      `<g transform="translate(${round(geometry.label.x)} ${round(geometry.label.y)})">`,
      `<circle r="11" fill="${negative ? color.negativeTint : color.surface}" stroke="${color.lineStrong}"/>`,
      `<text text-anchor="middle" dy="0.35em" font-family="${MONO}" font-size="14" font-weight="600" fill="${negative ? color.negative : color.ink}">${negative ? "−" : "+"}</text>`,
      "</g>",
      "</g>",
    ].join("");
  });

  const entries = listLoopEntries(diagram.loops, diagram.links, findLoops(diagram.links).loops);
  const markerPoints = diagram.loops.map((loop) => {
    const entry = entries.find((item) => item.featured?.loop.id === loop.id)!;
    const points = entry.variables.map((id) => boxOf(id).center);
    return { loop, entry, points, at: loop.marker ?? centroid(points) };
  });
  const markers = markerPoints.map(({ loop, entry, points, at }) => {
    const stroke = entry.kind === "reinforcing" ? color.accent : color.ink2;
    const flip = isClockwise(points) ? "" : ` transform="scale(-1 1)"`;
    const name = loop.name
      ? `<text y="42" text-anchor="middle" font-family="${SANS}" font-size="12" font-weight="500" fill="${color.ink2}" stroke="${color.canvas}" stroke-width="4" stroke-linejoin="round" paint-order="stroke">${escape(loop.name)}</text>`
      : "";
    return [
      `<g data-loop-id="${escape(loop.id)}" transform="translate(${round(at.x)} ${round(at.y)})">`,
      // 透明度を色に含めないのは、rgb( / ) の書き方を読めない描画系があり、黒く塗られるため
      `<circle r="26" fill="${color.glass}" fill-opacity="0.92" stroke="${color.line}"/>`,
      `<g${flip} fill="none" stroke="${stroke}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">`,
      `<path d="${LOOP_ARC}"/><path d="${LOOP_ARROW_HEAD}"/>`,
      "</g>",
      `<text text-anchor="middle" dy="0.35em" font-family="${MONO}" font-size="12" font-weight="600" fill="${color.ink}">${escape(entry.featured!.badge)}</text>`,
      name,
      "</g>",
    ].join("");
  });

  const nodes = boxes.map(({ variable, center, size }) => {
    const label = variable.label || UNNAMED_LABEL;
    const style = variable.label
      ? `fill="${color.ink}"`
      : `fill="${color.faint}" font-style="italic"`;
    return [
      `<g data-variable-id="${escape(variable.id)}" transform="translate(${round(center.x)} ${round(center.y)})">`,
      `<rect x="${-size.width / 2}" y="${-size.height / 2}" width="${size.width}" height="${size.height}" rx="${size.height / 2}" fill="${color.surface}" stroke="${color.lineStrong}"/>`,
      `<text text-anchor="middle" dy="0.35em" font-family="${SANS}" font-size="14" font-weight="500" ${style}>${escape(label)}</text>`,
      "</g>",
    ].join("");
  });

  const bounds = boundsOf([
    ...boxes,
    ...extents,
    ...markerPoints.map(({ at, loop }) => ({
      center: { x: at.x, y: at.y + (loop.name ? 16 : 0) },
      size: { width: Math.max(52, loop.name.length * 12), height: loop.name ? 84 : 52 },
    })),
  ]) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const x = Math.floor(bounds.minX - PADDING);
  const y = Math.floor(bounds.minY - PADDING);
  const width = Math.ceil(bounds.maxX + PADDING) - x;
  const height = Math.ceil(bounds.maxY + PADDING) - y;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}">`,
    `<title>${escape(diagram.title)}</title>`,
    // context-stroke を使わないのは、対応していない描画系があり、矢じりが黒くなるため
    `<defs><marker id="arrowhead" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 L 2.5 5 z" fill="${color.link}"/></marker></defs>`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color.canvas}"/>`,
    ...links,
    ...markers,
    ...nodes,
    "</svg>",
  ].join("\n");
  return { svg: `${svg}\n`, width, height };
};

const round = (value: number) => Math.round(value * 100) / 100;

const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
