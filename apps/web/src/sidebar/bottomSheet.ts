export type SheetSize = "peek" | "half" | "full";

const SIZES: readonly SheetSize[] = ["peek", "half", "full"];
export const TAP_SLOP = 6;
const PEEK_HEIGHT = 136;
/** 全体まで広げても、56px のツールバーの下にキャンバスを 120px は残す */
const FULL_GAP = 56 + 120;

/** CSS で段ごとの高さを決めないのは、引いた高さに近い段を選ぶために、JS でも同じ値が要るため */
export const heightsFor = (viewport: number): Record<SheetSize, number> => ({
  peek: PEEK_HEIGHT,
  half: Math.round(viewport / 2),
  full: viewport - FULL_GAP,
});

export const nearestSize = (heights: Record<SheetSize, number>, height: number): SheetSize =>
  SIZES.reduce((best, size) =>
    Math.abs(heights[size] - height) < Math.abs(heights[best] - height) ? size : best,
  );

export const nextSize = (size: SheetSize): SheetSize =>
  SIZES[(SIZES.indexOf(size) + 1) % SIZES.length]!;

export const clampHeight = (heights: Record<SheetSize, number>, height: number) =>
  Math.max(heights.peek, Math.min(heights.full, height));
