import { describe, expect, it } from "vite-plus/test";
import tokensCss from "./tokens.css?raw";

type Rgba = [number, number, number, number];

function declarations(block: string) {
  const colors = new Map<string, string>();
  for (const [, name = "", value = ""] of block.matchAll(/--color-([\w-]+):\s*([^;]+);/g)) {
    colors.set(name, value.trim());
  }
  return colors;
}

function blockAfter(marker: string) {
  const start = tokensCss.indexOf("{", tokensCss.indexOf(marker));
  let depth = 0;
  for (let index = start; index < tokensCss.length; index++) {
    if (tokensCss[index] === "{") depth++;
    if (tokensCss[index] === "}" && --depth === 0) return tokensCss.slice(start, index);
  }
  throw new Error(`${marker} が閉じていません`);
}

const light = declarations(blockAfter(":root {"));
const themes = {
  light,
  dark: new Map([...light, ...declarations(blockAfter(':root[data-theme="dark"]'))]),
};

function parse(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)?.[1];
  if (hex) {
    const n = Number.parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4] ?? 1)];
  throw new Error(`読めない色です: ${value}`);
}

function over([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba {
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
}

function luminance([r, g, b]: Rgba) {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(colors: Map<string, string>, foreground: string, background: string) {
  const color = (name: string) => {
    const value = colors.get(name);
    if (!value) throw new Error(`--color-${name} がありません`);
    return parse(value);
  };
  const [top = background, bottom = "surface"] = background.split(" on ");
  const ground = over(color(top), color(bottom));
  const [a, b] = [luminance(over(color(foreground), ground)), luminance(ground)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const textPairs: [string, string][] = [
  ["ink", "surface"],
  ["ink", "canvas"],
  ["ink-2", "surface"],
  ["ink-2", "surface-2"],
  ["muted", "surface"],
  ["muted", "surface-2"],
  ["muted", "canvas"],
  ["accent", "surface"],
  ["accent", "canvas"],
  ["accent-strong", "accent-soft"],
  ["accent-strong", "accent-soft on surface-2"],
  ["accent-strong", "accent-tint"],
  ["accent-strong", "glass on canvas"],
  ["on-strong", "accent"],
  ["on-strong", "ink-2"],
  ["on-ink", "ink"],
  ["on-ink", "ink-hover"],
  ["negative", "surface"],
  ["negative", "negative-tint"],
  ["negative", "negative-soft"],
  ["warning", "warning-soft"],
];

const graphicPairs: [string, string][] = [
  ["link", "canvas"],
  ["accent", "accent-tint"],
  ["warning-dot", "surface"],
];

describe.each(Object.entries(themes))("%s テーマの色", (_, colors) => {
  it.each(textPairs)("文字の %s は %s の上で 4.5:1 以上ある", (foreground, background) => {
    expect(contrast(colors, foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(graphicPairs)("線や印の %s は %s の上で 3:1 以上ある", (foreground, background) => {
    expect(contrast(colors, foreground, background)).toBeGreaterThanOrEqual(3);
  });
});
