import { moveVariables, updateLink, updateLoop } from "./edit.ts";
import {
  centroid,
  defaultCurvature,
  linkGeometry,
  NODE_HEIGHT,
  NODE_MIN_WIDTH,
  quadraticPoint,
} from "./geometry.ts";
import type { Size } from "./geometry.ts";
import { linkPairKey } from "./integrity.ts";
import type { Diagram, LoopId, Point, VariableId } from "./schema.ts";

/*
 * 初期配置に乱数を使わないのは、毎回同じ結果にするため。
 * 円周へ元の並び順で並べないのは、関連を辿った順ならループの変数が隣り合い、交差の少ない形に落ち着きやすいため。
 */

/** 枠の間ではなく中心同士の距離 */
const IDEAL_LENGTH = 170;
const ITERATIONS = 400;
const GAP_X = 40;
const GAP_Y = 56;
const GRAVITY = 0.04;
const FALLBACK_SIZE: Size = { width: NODE_MIN_WIDTH, height: NODE_HEIGHT };

export const autoLayout = (diagram: Diagram, sizes: ReadonlyMap<VariableId, Size>): Diagram => {
  const variables = diagram.variables;
  if (variables.length === 0) return diagram;
  const ids = variables.map((variable) => variable.id);
  const index = new Map(ids.map((id, at) => [id, at]));
  const sizeOf = (at: number) => sizes.get(ids[at]!) ?? FALLBACK_SIZE;

  const edges = undirectedEdges(diagram, index);
  const order = traversalOrder(ids.length, edges);
  const positions = initialCircle(order, (at) => sizeOf(at).width);

  simulate(positions, edges, sizeOf);
  removeOverlaps(positions, sizeOf);

  // 元の図の重心に合わせ直さないと、整列のたびに表示位置が大きく飛ぶ
  const before = centroid(variables.map((variable) => variable.position));
  const after = centroid(positions);
  const moved = new Map<VariableId, Point>(
    ids.map((id, at) => [
      id,
      {
        x: Math.round(positions[at]!.x - after.x + before.x),
        y: Math.round(positions[at]!.y - after.y + before.y),
      },
    ]),
  );

  // 手で付けた曲がり具合を残さないのは、位置が変わると意味を失うため
  let next = moveVariables(diagram, moved);
  for (const link of diagram.links) next = updateLink(next, link.id, { curvature: undefined });
  const markers = placeMarkers(next, sizes);
  for (const loop of next.loops) {
    const marker = markers.get(loop.id);
    // 同じ位置でも差し替えると、整列を繰り返したときに変化の無い編集が生まれる
    if (marker?.x === loop.marker?.x && marker?.y === loop.marker?.y) continue;
    next = updateLoop(next, loop.id, { marker });
  }
  return next;
};

const undirectedEdges = (diagram: Diagram, index: ReadonlyMap<VariableId, number>) => {
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  for (const link of diagram.links) {
    // 図は検証済みなので、参照先は必ずあり、自分自身への関連も無い
    const a = index.get(link.from)!;
    const b = index.get(link.to)!;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push([a, b]);
  }
  return edges;
};

const traversalOrder = (count: number, edges: readonly [number, number][]) => {
  const neighbors: number[][] = Array.from({ length: count }, () => []);
  for (const [a, b] of edges) {
    neighbors[a]!.push(b);
    neighbors[b]!.push(a);
  }
  const visited = new Set<number>();
  const order: number[] = [];
  // 先頭の変数から始めないのは、繋がりの多い変数からの方が中心的なループがまとまって並ぶため
  const starts = [...neighbors.keys()].sort(
    (a, b) => neighbors[b]!.length - neighbors[a]!.length || a - b,
  );
  for (const start of starts) {
    if (visited.has(start)) continue;
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      order.push(current);
      for (const next of [...neighbors[current]!].reverse()) {
        if (!visited.has(next)) stack.push(next);
      }
    }
  }
  return order;
};

const initialCircle = (order: readonly number[], widthOf: (at: number) => number): Point[] => {
  const positions: Point[] = Array.from({ length: order.length }, () => ({ x: 0, y: 0 }));
  if (order.length === 1) return positions;
  const circumference = order.reduce((sum, at) => sum + widthOf(at) + GAP_X, 0);
  const radius = Math.max(IDEAL_LENGTH * 0.75, circumference / (2 * Math.PI));
  for (const [step, at] of order.entries()) {
    const angle = -Math.PI / 2 + (2 * Math.PI * step) / order.length;
    positions[at] = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  }
  return positions;
};

/** Fruchterman–Reingold。素のままでは変数を点として扱い長い名前同士が詰まるので、横幅の分だけ反発を強める */
const simulate = (
  positions: Point[],
  edges: readonly [number, number][],
  sizeOf: (at: number) => Size,
) => {
  const count = positions.length;
  if (count < 2) return;
  let temperature = IDEAL_LENGTH;
  const cooling = temperature / (ITERATIONS + 1);
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    const forces: Point[] = positions.map(() => ({ x: 0, y: 0 }));
    for (let a = 0; a < count; a++) {
      for (let b = a + 1; b < count; b++) {
        const { dx, dy, distance } = delta(positions[a]!, positions[b]!);
        const reach = IDEAL_LENGTH + (sizeOf(a).width + sizeOf(b).width) / 4;
        const force = (reach * reach) / distance;
        apply(forces, a, b, (dx / distance) * force, (dy / distance) * force);
      }
    }
    for (const [a, b] of edges) {
      const { dx, dy, distance } = delta(positions[a]!, positions[b]!);
      const force = (distance * distance) / IDEAL_LENGTH;
      apply(forces, a, b, (-dx / distance) * force, (-dy / distance) * force);
    }
    const center = centroid(positions);
    for (let at = 0; at < count; at++) {
      const force = forces[at]!;
      force.x += (center.x - positions[at]!.x) * GRAVITY * IDEAL_LENGTH * 0.1;
      force.y += (center.y - positions[at]!.y) * GRAVITY * IDEAL_LENGTH * 0.1;
      const length = Math.hypot(force.x, force.y);
      if (length === 0) continue;
      const step = Math.min(length, temperature);
      positions[at] = {
        x: positions[at]!.x + (force.x / length) * step,
        y: positions[at]!.y + (force.y / length) * step,
      };
    }
    temperature -= cooling;
  }
};

const removeOverlaps = (positions: Point[], sizeOf: (at: number) => Size) => {
  const count = positions.length;
  for (let round = 0; round < 100; round++) {
    let moved = false;
    for (let a = 0; a < count; a++) {
      for (let b = a + 1; b < count; b++) {
        const pa = positions[a]!;
        const pb = positions[b]!;
        const overlapX = (sizeOf(a).width + sizeOf(b).width) / 2 + GAP_X - Math.abs(pb.x - pa.x);
        const overlapY = (sizeOf(a).height + sizeOf(b).height) / 2 + GAP_Y - Math.abs(pb.y - pa.y);
        if (overlapX <= 0 || overlapY <= 0) continue;
        moved = true;
        if (overlapX < overlapY) {
          const shift = (overlapX / 2) * (pb.x >= pa.x ? 1 : -1);
          positions[a] = { x: pa.x - shift, y: pa.y };
          positions[b] = { x: pb.x + shift, y: pb.y };
        } else {
          const shift = (overlapY / 2) * (pb.y >= pa.y ? 1 : -1);
          positions[a] = { x: pa.x, y: pa.y - shift };
          positions[b] = { x: pb.x, y: pb.y + shift };
        }
      }
    }
    if (!moved) return;
  }
};

/** 記号だけでなく、添える名前の分も含む */
const MARKER_CLEARANCE = 64;
const MARKER_GRID = 8;

const CURVE_STEPS = 8;
/** 極性の印の半径（11）に余白を足したもの */
const POLARITY_RADIUS = 28;
/** ほかのループ記号の半径（26）に余白を足したもの */
const MARKER_RADIUS = 40;

const placeMarkers = (diagram: Diagram, sizes: ReadonlyMap<VariableId, Size>) => {
  const variableById = new Map(diagram.variables.map((variable) => [variable.id, variable]));
  const boxOf = (id: VariableId) => ({
    center: variableById.get(id)!.position,
    size: sizes.get(id) ?? FALLBACK_SIZE,
  });
  const boxes = diagram.variables.map((variable) => boxOf(variable.id));
  // 関連を直線とみなさないのは、画面では逆向きの関連があると曲線で描かれ、記号がその曲線に重なりうるため
  const pairs = new Set(diagram.links.map((link) => linkPairKey(link.from, link.to)));
  const segments: [Point, Point][] = [];
  const labels: Point[] = [];
  for (const link of diagram.links) {
    const curvature = defaultCurvature(pairs.has(linkPairKey(link.to, link.from)));
    const { start, control, end, label } = linkGeometry(
      boxOf(link.from),
      boxOf(link.to),
      curvature,
    );
    let previous = start;
    for (let step = 1; step <= CURVE_STEPS; step++) {
      const point = quadraticPoint(start, control, end, step / CURVE_STEPS);
      segments.push([previous, point]);
      previous = point;
    }
    labels.push(label);
  }

  const placed: Point[] = [];
  const clearance = (point: Point) => {
    let nearest = Infinity;
    for (const box of boxes) nearest = Math.min(nearest, boxDistance(point, box.center, box.size));
    for (const [a, b] of segments) nearest = Math.min(nearest, segmentDistance(point, a, b));
    for (const label of labels)
      nearest = Math.min(nearest, distance(point, label) - POLARITY_RADIUS);
    for (const other of placed) nearest = Math.min(nearest, distance(point, other) - MARKER_RADIUS);
    return nearest;
  };

  const fromByLink = new Map(diagram.links.map((link) => [link.id, link.from]));
  const markers = new Map<LoopId, Point>();
  for (const loop of diagram.loops) {
    const polygon = loop.links.map((id) => variableById.get(fromByLink.get(id)!)!.position);
    const center = centroid(polygon);
    let best = { point: center, score: -Infinity, distance: Infinity };
    const xs = polygon.map((point) => point.x);
    const ys = polygon.map((point) => point.y);
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += MARKER_GRID) {
      for (let y = Math.min(...ys); y <= Math.max(...ys); y += MARKER_GRID) {
        const point = { x, y };
        if (!insidePolygon(point, polygon)) continue;
        const score = Math.min(clearance(point), MARKER_CLEARANCE);
        const away = distance(point, center);
        if (score > best.score || (score === best.score && away < best.distance)) {
          best = { point, score, distance: away };
        }
      }
    }
    const marker = { x: Math.round(best.point.x), y: Math.round(best.point.y) };
    placed.push(marker);
    markers.set(loop.id, marker);
  }
  return markers;
};

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const boxDistance = (point: Point, center: Point, size: Size) => {
  const dx = Math.max(Math.abs(point.x - center.x) - size.width / 2, 0);
  const dy = Math.max(Math.abs(point.y - center.y) - size.height / 2, 0);
  return Math.hypot(dx, dy);
};

const segmentDistance = (point: Point, a: Point, b: Point) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
};

const insidePolygon = (point: Point, polygon: readonly Point[]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > point.y !== b.y > point.y) {
      const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
};

/** 円周上の異なる点から始めるので重なることはまず無いが、0 で割らないよう守る */
const delta = (pa: Point, pb: Point) => {
  const dx = pa.x - pb.x;
  const dy = pa.y - pb.y;
  return { dx, dy, distance: Math.max(Math.hypot(dx, dy), 0.01) };
};

const apply = (forces: Point[], a: number, b: number, fx: number, fy: number) => {
  forces[a]!.x += fx;
  forces[a]!.y += fy;
  forces[b]!.x -= fx;
  forces[b]!.y -= fy;
};
