import type { Point } from "./schema.ts";

export interface Size {
  width: number;
  height: number;
}

export const NODE_HEIGHT = 36;
export const NODE_PADDING_X = 16;
export const NODE_MIN_WIDTH = 72;
export const DEFAULT_CURVATURE = 0;
/** 対になった関連を直線で描くと逆向きの関連と重なるので、この分だけ曲げる */
export const PAIRED_CURVATURE = 0.18;
const LINK_GAP = 6;

export function nodeSize(labelWidth: number): Size {
  return {
    width: Math.max(NODE_MIN_WIDTH, Math.ceil(labelWidth) + NODE_PADDING_X * 2),
    height: NODE_HEIGHT,
  };
}

/** center は矩形の左上ではなく中心 */
export function boxBoundaryPoint(center: Point, size: Size, toward: Point): Point {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const scale = Math.min(
    dx === 0 ? Infinity : size.width / 2 / Math.abs(dx),
    dy === 0 ? Infinity : size.height / 2 / Math.abs(dy),
  );
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

export interface LinkGeometry {
  start: Point;
  control: Point;
  end: Point;
  /** SVG の path d 属性 */
  path: string;
  middle: Point;
  /** 中点での進行方向の単位ベクトル */
  tangent: Point;
  label: Point;
}

export function quadraticPoint(start: Point, control: Point, end: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
    y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
  };
}

function quadraticTangent(start: Point, control: Point, end: Point, t: number): Point {
  const x = 2 * (1 - t) * (control.x - start.x) + 2 * t * (end.x - control.x);
  const y = 2 * (1 - t) * (control.y - start.y) + 2 * t * (end.y - control.y);
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

/** 左は画面上（y 軸下向き）で見た向き */
function leftNormal(dx: number, dy: number): Point {
  const length = Math.hypot(dx, dy) || 1;
  return { x: dy / length, y: -dx / length };
}

function controlPoint(from: Point, to: Point, curvature: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const normal = leftNormal(dx, dy);
  // 2 倍しないと、曲線の中点は制御点のずれの半分しか膨らまない
  const offset = curvature * distance * 2;
  return {
    x: (from.x + to.x) / 2 + normal.x * offset,
    y: (from.y + to.y) / 2 + normal.y * offset,
  };
}

export function defaultCurvature(hasReverse: boolean): number {
  return hasReverse ? PAIRED_CURVATURE : DEFAULT_CURVATURE;
}

export function linkGeometry(
  from: { center: Point; size: Size },
  to: { center: Point; size: Size },
  curvature = DEFAULT_CURVATURE,
): LinkGeometry {
  const control = controlPoint(from.center, to.center, curvature);
  const rawStart = boxBoundaryPoint(from.center, from.size, control);
  const rawEnd = boxBoundaryPoint(to.center, to.size, control);
  const start = moveToward(rawStart, control, LINK_GAP);
  const end = moveToward(rawEnd, control, LINK_GAP);
  const middle = quadraticPoint(start, control, end, 0.5);
  const tangent = quadraticTangent(start, control, end, 0.5);
  const labelAnchor = quadraticPoint(start, control, end, 0.82);
  const labelTangent = quadraticTangent(start, control, end, 0.82);
  const side = curvature >= 0 ? 1 : -1;
  const normal = leftNormal(labelTangent.x, labelTangent.y);
  return {
    start,
    control,
    end,
    path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    middle,
    tangent,
    label: {
      x: labelAnchor.x + normal.x * 17 * side,
      y: labelAnchor.y + normal.y * 17 * side,
    },
  };
}

function moveToward(point: Point, target: Point, distance: number): Point {
  const dx = target.x - point.x;
  const dy = target.y - point.y;
  const length = Math.hypot(dx, dy);
  if (length <= distance) return point;
  return { x: point.x + (dx / length) * distance, y: point.y + (dy / length) * distance };
}

export function centroid(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/** 時計回りは画面上（y 軸下向き）で見た向き */
export function isClockwise(points: readonly Point[]): boolean {
  let area = 0;
  for (const [index, point] of points.entries()) {
    const next = points[(index + 1) % points.length]!;
    area += point.x * next.y - next.x * point.y;
  }
  return area > 0;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOf(boxes: readonly { center: Point; size: Size }[]): Bounds | undefined {
  if (boxes.length === 0) return undefined;
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const { center, size } of boxes) {
    bounds.minX = Math.min(bounds.minX, center.x - size.width / 2);
    bounds.minY = Math.min(bounds.minY, center.y - size.height / 2);
    bounds.maxX = Math.max(bounds.maxX, center.x + size.width / 2);
    bounds.maxY = Math.max(bounds.maxY, center.y + size.height / 2);
  }
  return bounds;
}
