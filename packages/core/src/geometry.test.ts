import { describe, expect, it } from "vite-plus/test";
import {
  boxBoundaryPoint,
  defaultCurvature,
  isClockwise,
  linkGeometry,
  nodeSize,
} from "./geometry.ts";

describe("geometry", () => {
  it("ラベルが短くても最小幅を保つ", () => {
    expect(nodeSize(10).width).toBe(72);
    expect(nodeSize(100).width).toBe(132);
  });

  it("矩形の枠との交点を求める", () => {
    const size = { width: 100, height: 40 };
    expect(boxBoundaryPoint({ x: 0, y: 0 }, size, { x: 200, y: 0 })).toEqual({ x: 50, y: 0 });
    expect(boxBoundaryPoint({ x: 0, y: 0 }, size, { x: 0, y: -200 })).toEqual({ x: 0, y: -20 });
  });

  it("正の曲がり具合では進行方向の左に膨らむ", () => {
    const from = { center: { x: 0, y: 0 }, size: { width: 0, height: 0 } };
    const to = { center: { x: 400, y: 0 }, size: { width: 0, height: 0 } };
    const geometry = linkGeometry(from, to, 0.25);
    // 左（画面上は上）に膨らむ
    expect(geometry.middle.y).toBeLessThan(0);
  });

  it("既定では直線にし、逆向きの関連があるときだけ膨らませる", () => {
    expect(defaultCurvature(false)).toBe(0);
    expect(defaultCurvature(true)).toBeGreaterThan(0);
    const from = { center: { x: 0, y: 0 }, size: { width: 0, height: 0 } };
    const to = { center: { x: 400, y: 0 }, size: { width: 0, height: 0 } };
    expect(linkGeometry(from, to).middle.y).toBeCloseTo(0);
  });

  it("画面座標で時計回りかを判定する", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(isClockwise(square)).toBe(true);
    expect(isClockwise(square.toReversed())).toBe(false);
  });
});
