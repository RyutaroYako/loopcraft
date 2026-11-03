import type { LoopKind } from "@loopcraft/core/loop";
import type { LoopEntry } from "@loopcraft/core/loops";
import { kindLabel } from "../sidebar/loopText.ts";

export interface LegendItem {
  badge: string;
  kind: LoopKind;
  name: string;
  kindText: string;
  description?: string;
}

export const legendItemsOf = (entries: readonly LoopEntry[]): LegendItem[] =>
  entries.flatMap((entry) => {
    const featured = entry.featured;
    if (!featured) return [];
    return [
      {
        badge: featured.badge,
        kind: entry.kind,
        name: featured.loop.name || kindLabel(entry.kind),
        kindText: kindLabel(entry.kind),
        ...(featured.loop.description ? { description: featured.loop.description } : {}),
      },
    ];
  });

export const hasLegendText = (items: readonly LegendItem[]) =>
  items.some((item) => item.description !== undefined);

export const LEGEND_METRICS = {
  padding: 32,
  badge: 24,
  badgeGap: 10,
  rowGap: 14,
  titleSize: 13,
  textSize: 12,
  textLineHeight: 1.6,
  titleGap: 4,
  kindGap: 8,
  minWidth: 480,
} as const;

export interface LegendRow {
  item: LegendItem;
  y: number;
  lines: string[];
}

export interface LegendLayout {
  width: number;
  height: number;
  rows: LegendRow[];
}

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

// 語の区切りで折らないのは、日本語の説明には空白が無く、一文が丸ごと次の行へ送られるため
export const wrapText = (text: string, maxWidth: number, measure: (text: string) => number) => {
  const lines: string[] = [];
  let line = "";
  for (const { segment: char } of graphemes.segment(text)) {
    if (line && measure(line + char) > maxWidth) {
      lines.push(line);
      line = char.trim() ? char : "";
      continue;
    }
    line += char;
  }
  if (line) lines.push(line);
  return lines;
};

export const layoutLegend = (
  items: readonly LegendItem[],
  imageWidth: number,
  measureText: (text: string) => number,
): LegendLayout => {
  const m = LEGEND_METRICS;
  const width = Math.max(imageWidth, m.minWidth);
  const textWidth = width - m.padding * 2 - m.badge - m.badgeGap;
  const lineHeight = m.textSize * m.textLineHeight;
  const rows: LegendRow[] = [];
  let y = m.padding;
  for (const item of items) {
    const lines = item.description ? wrapText(item.description, textWidth, measureText) : [];
    rows.push({ item, y, lines });
    const textHeight =
      m.titleSize * m.textLineHeight + (lines.length ? m.titleGap + lines.length * lineHeight : 0);
    y += Math.max(m.badge, textHeight) + m.rowGap;
  }
  return { width, height: y - m.rowGap + m.padding, rows };
};
