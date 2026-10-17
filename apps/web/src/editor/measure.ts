/** CanvasNode.vue の .node-label と揃える */
export const LABEL_FONT = `500 14px "Geist Variable", "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif`;

const cache = new Map<string, number>();
let context: CanvasRenderingContext2D | null | undefined;

export const measureLabel = (text: string): number => {
  const cached = cache.get(text);
  if (cached !== undefined) return cached;
  if (context === undefined) {
    context = document.createElement("canvas").getContext("2d");
    if (context) context.font = LABEL_FONT;
  }
  const width = context ? context.measureText(text).width : estimate(text);
  cache.set(text, width);
  return width;
};

/** 読み込み前の Web フォントで測った幅は、読み込み後には合わない */
export const clearMeasureCache = () => {
  cache.clear();
  if (context) context.font = LABEL_FONT;
};

const estimate = (text: string) => {
  let width = 0;
  for (const char of text) width += char.charCodeAt(0) > 0xff ? 14 : 8;
  return width;
};
