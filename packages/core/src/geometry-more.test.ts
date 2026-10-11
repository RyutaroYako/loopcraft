import { describe, expect, it } from "vite-plus/test";
import {
  boundsOf,
  boxBoundaryPoint,
  centroid,
  curvatureFromHandle,
  linkGeometry,
  quadraticPoint,
} from "./geometry.ts";

describe("geometry（境界値）", () => {
  it("同じ点へは中心をそのまま返す", () => {
    const center = { x: 3, y: 4 };
    expect(boxBoundaryPoint(center, { width: 10, height: 10 }, center)).toBe(center);
  });

  it("負の曲がり具合では右に膨らみ、ラベルもその外側に置く", () => {
    const from = { center: { x: 0, y: 0 }, size: { width: 0, height: 0 } };
    const to = { center: { x: 400, y: 0 }, size: { width: 0, height: 0 } };
    const geometry = linkGeometry(from, to, -0.25);
    expect(geometry.middle.y).toBeGreaterThan(0);
    const anchor = quadraticPoint(geometry.start, geometry.control, geometry.end, 0.82);
    expect(geometry.label.y).toBeGreaterThan(anchor.y);
    expect(geometry.path.startsWith("M ")).toBe(true);
  });

  it("端点が近すぎるときは隙間をあけない", () => {
    const box = { center: { x: 0, y: 0 }, size: { width: 0, height: 0 } };
    const geometry = linkGeometry(box, { ...box, center: { x: 2, y: 0 } }, 0);
    expect(geometry.start).toEqual({ x: 0, y: 0 });
  });

  it("端点が重なっていれば曲がり具合は 0", () => {
    expect(curvatureFromHandle({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 5, y: 5 })).toBe(0);
  });

  it("二次ベジェの両端は始点と終点", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 10, y: 0 };
    expect(quadraticPoint(start, { x: 5, y: 5 }, end, 0)).toEqual(start);
    expect(quadraticPoint(start, { x: 5, y: 5 }, end, 1)).toEqual(end);
  });

  it("重心と外接矩形を求める", () => {
    expect(centroid([])).toEqual({ x: 0, y: 0 });
    expect(
      centroid([
        { x: 0, y: 0 },
        { x: 4, y: 2 },
      ]),
    ).toEqual({ x: 2, y: 1 });
    expect(boundsOf([])).toBeUndefined();
    expect(
      boundsOf([
        { center: { x: 0, y: 0 }, size: { width: 10, height: 4 } },
        { center: { x: 20, y: 10 }, size: { width: 2, height: 2 } },
      ]),
    ).toEqual({ minX: -5, minY: -2, maxX: 21, maxY: 11 });
  });
});
