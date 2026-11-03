import { CAPTURE_SCALE } from "../canvas/screenshot.ts";
import { LEGEND_METRICS, layoutLegend } from "./legend.ts";
import type { LegendItem } from "./legend.ts";

/*
 * 写す前の画面に凡例を置かないのは、modern-screenshot が元の要素の computed style を写すため、
 * 写すためだけに足した要素には見た目が付かないため
 */
export const appendLegend = async (image: Blob, items: readonly LegendItem[]): Promise<Blob> => {
  await document.fonts.ready;
  const bitmap = await createImageBitmap(image);
  try {
    return await drawWithLegend(bitmap, items);
  } finally {
    // ガベージコレクションに任せないのは、大きな図では画像を作り直すたびにデコードした画素が溜まるため
    bitmap.close();
  }
};

const drawWithLegend = async (bitmap: ImageBitmap, items: readonly LegendItem[]) => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像を作れませんでした");

  const tokens = getComputedStyle(document.documentElement);
  const color = (name: string) => tokens.getPropertyValue(name).trim();
  const family = getComputedStyle(document.body).fontFamily;
  const font = (weight: number, size: number) => `${weight} ${size}px ${family}`;
  const m = LEGEND_METRICS;

  context.font = font(400, m.textSize);
  const layout = layoutLegend(
    items,
    bitmap.width / CAPTURE_SCALE,
    (text) => context.measureText(text).width,
  );
  canvas.width = Math.round(layout.width * CAPTURE_SCALE);
  canvas.height = bitmap.height + Math.round(layout.height * CAPTURE_SCALE);

  context.fillStyle = color("--color-canvas");
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, Math.round((canvas.width - bitmap.width) / 2), 0);

  context.setTransform(CAPTURE_SCALE, 0, 0, CAPTURE_SCALE, 0, bitmap.height);
  context.strokeStyle = color("--color-line");
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(m.padding, 0.5);
  context.lineTo(layout.width - m.padding, 0.5);
  context.stroke();

  const textX = m.padding + m.badge + m.badgeGap;
  const titleLine = m.titleSize * m.textLineHeight;
  const textLine = m.textSize * m.textLineHeight;
  context.textBaseline = "middle";
  for (const { item, y, lines } of layout.rows) {
    context.fillStyle = color(item.kind === "reinforcing" ? "--color-accent" : "--color-ink-2");
    context.beginPath();
    context.roundRect(m.padding, y, m.badge, m.badge, 6);
    context.fill();
    context.fillStyle = color("--color-on-strong");
    context.font = font(700, 10.5);
    context.textAlign = "center";
    context.fillText(item.badge, m.padding + m.badge / 2, y + m.badge / 2);

    context.textAlign = "start";
    context.fillStyle = color("--color-ink");
    context.font = font(600, m.titleSize);
    context.fillText(item.name, textX, y + titleLine / 2);
    const nameWidth = context.measureText(item.name).width;
    context.fillStyle = color("--color-muted");
    context.font = font(400, m.textSize);
    context.fillText(item.kindText, textX + nameWidth + m.kindGap, y + titleLine / 2);

    context.fillStyle = color("--color-ink-2");
    lines.forEach((line, index) => {
      const top = y + titleLine + m.titleGap + index * textLine;
      context.fillText(line, textX, top + textLine / 2);
    });
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("画像を作れませんでした");
  return blob;
};
