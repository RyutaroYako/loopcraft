import { moveVariables, updateLink, updateLoop } from "./edit.ts";
import {
  centroid,
  defaultCurvature,
  linkGeometry,
  NODE_HEIGHT,
  NODE_MIN_WIDTH,
  quadraticPoint,
  type Size,
} from "./geometry.ts";
import { linkPairKey } from "./integrity.ts";
import type { Diagram, LoopId, Point, VariableId } from "./schema.ts";

/*
 * 自動レイアウト。力学モデル（関連はばね、出来事同士は反発）で配置し、最後に枠の重なりを解く。
 * 毎回同じ結果になるよう乱数は使わず、関連を辿った順に円周へ並べた状態から始める。
 * ループを構成する出来事が円周上で隣り合うので、交差の少ない形に落ち着きやすい。
 */

/** 関連で結ばれた出来事の中心同士の理想的な距離 */
const IDEAL_LENGTH = 170;
const ITERATIONS = 400;
/** 枠同士の最小の隙間 */
const GAP_X = 40;
const GAP_Y = 56;
const GRAVITY = 0.04;
/** 大きさが分からない出来事は、名前が空のときの大きさとみなす */
const FALLBACK_SIZE: Size = { width: NODE_MIN_WIDTH, height: NODE_HEIGHT };

export function autoLayout(diagram: Diagram, sizes: ReadonlyMap<VariableId, Size>): Diagram {
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

  // 元の図の重心に合わせて、表示位置が大きく飛ばないようにする
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

  // 位置が変わると手で付けた曲がり具合は意味を失うので既定に戻し、ループ記号は空いた所へ置き直す
  let next = moveVariables(diagram, moved);
  for (const link of diagram.links) next = updateLink(next, link.id, { curvature: undefined });
  const markers = placeMarkers(next, sizes);
  for (const loop of next.loops) {
    const marker = markers.get(loop.id);
    // 同じ位置なら差し替えず、整列を繰り返しても変化の無い編集にならないようにする
    if (marker?.x === loop.marker?.x && marker?.y === loop.marker?.y) continue;
    next = updateLoop(next, loop.id, { marker });
  }
  return next;
}

function undirectedEdges(diagram: Diagram, index: ReadonlyMap<VariableId, number>) {
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  for (const link of diagram.links) {
    const a = index.get(link.from);
    const b = index.get(link.to);
    if (a === undefined || b === undefined || a === b) continue;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push([a, b]);
  }
  return edges;
}

/** 関連を深さ優先で辿った順。繋がっていない出来事は元の並び順で後に続ける */
function traversalOrder(count: number, edges: readonly [number, number][]) {
  const neighbors: number[][] = Array.from({ length: count }, () => []);
  for (const [a, b] of edges) {
    neighbors[a]!.push(b);
    neighbors[b]!.push(a);
  }
  const visited = new Set<number>();
  const order: number[] = [];
  // 繋がりの多い出来事から始めると、中心的なループがまとまって並ぶ
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
}

function initialCircle(order: readonly number[], widthOf: (at: number) => number): Point[] {
  const positions: Point[] = Array.from({ length: order.length }, () => ({ x: 0, y: 0 }));
  if (order.length === 1) return positions;
  const circumference = order.reduce((sum, at) => sum + widthOf(at) + GAP_X, 0);
  const radius = Math.max(IDEAL_LENGTH * 0.75, circumference / (2 * Math.PI));
  for (const [step, at] of order.entries()) {
    const angle = -Math.PI / 2 + (2 * Math.PI * step) / order.length;
    positions[at] = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  }
  return positions;
}

/** Fruchterman–Reingold。出来事の横幅の分だけ反発を強めて、長い名前同士が詰まらないようにする */
function simulate(
  positions: Point[],
  edges: readonly [number, number][],
  sizeOf: (at: number) => Size,
) {
  const count = positions.length;
  if (count < 2) return;
  let temperature = IDEAL_LENGTH;
  const cooling = temperature / (ITERATIONS + 1);
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    const forces: Point[] = positions.map(() => ({ x: 0, y: 0 }));
    for (let a = 0; a < count; a++) {
      for (let b = a + 1; b < count; b++) {
        const { dx, dy, distance } = delta(positions[a]!, positions[b]!, a, b);
        const reach = IDEAL_LENGTH + (sizeOf(a).width + sizeOf(b).width) / 4;
        const force = (reach * reach) / distance;
        apply(forces, a, b, (dx / distance) * force, (dy / distance) * force);
      }
    }
    for (const [a, b] of edges) {
      const { dx, dy, distance } = delta(positions[a]!, positions[b]!, a, b);
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
}

/** 枠（隙間込み）が重なっている組を、重なりの小さい軸の方向へ押し広げる */
function removeOverlaps(positions: Point[], sizeOf: (at: number) => Size) {
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
}

/** ループ記号（名前を含む）がほかの要素から離れていてほしい距離 */
const MARKER_CLEARANCE = 64;
const MARKER_GRID = 8;

/** 曲線の関連を折れ線で近似するときの分割数 */
const CURVE_STEPS = 8;
/** 極性の印の半径（11）に余白を足したもの */
const POLARITY_RADIUS = 28;
/** ほかのループ記号の半径（26）に余白を足したもの */
const MARKER_RADIUS = 40;

/**
 * 各ループの記号を、ループの内側で出来事・関連・極性の印・ほかの記号から最も離れた点に置く。
 * 十分に離れた点がいくつもあるときは重心に近いものを選ぶ。内側に点が無いときは重心に置く
 */
function placeMarkers(diagram: Diagram, sizes: ReadonlyMap<VariableId, Size>) {
  const variableById = new Map(diagram.variables.map((variable) => [variable.id, variable]));
  const boxOf = (id: VariableId) => {
    const variable = variableById.get(id);
    return variable && { center: variable.position, size: sizes.get(id) ?? FALLBACK_SIZE };
  };
  const boxes = diagram.variables.map((variable) => boxOf(variable.id)!);
  // 関連は画面と同じ形（逆向きの関連があれば曲線）で、折れ線と極性の印の位置に分解しておく
  const pairs = new Set(diagram.links.map((link) => linkPairKey(link.from, link.to)));
  const segments: [Point, Point][] = [];
  const labels: Point[] = [];
  for (const link of diagram.links) {
    const from = boxOf(link.from);
    const to = boxOf(link.to);
    if (!from || !to) continue;
    const curvature = defaultCurvature(pairs.has(linkPairKey(link.to, link.from)));
    const { start, control, end, label } = linkGeometry(from, to, curvature);
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
    const polygon = loop.links.flatMap((id) => {
      const from = fromByLink.get(id);
      const variable = from && variableById.get(from);
      return variable ? [variable.position] : [];
    });
    if (polygon.length === 0) continue;
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
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function boxDistance(point: Point, center: Point, size: Size) {
  const dx = Math.max(Math.abs(point.x - center.x) - size.width / 2, 0);
  const dy = Math.max(Math.abs(point.y - center.y) - size.height / 2, 0);
  return Math.hypot(dx, dy);
}

function segmentDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function insidePolygon(point: Point, polygon: readonly Point[]) {
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
}

/** a から見た b へのずれ。位置が重なっているときは添字から決まる向きにわずかにずらす */
function delta(pa: Point, pb: Point, a: number, b: number) {
  let dx = pa.x - pb.x;
  let dy = pa.y - pb.y;
  if (dx === 0 && dy === 0) {
    const angle = (a * 7 + b * 13) % 360;
    dx = Math.cos((angle * Math.PI) / 180) * 0.01;
    dy = Math.sin((angle * Math.PI) / 180) * 0.01;
  }
  return { dx, dy, distance: Math.max(Math.hypot(dx, dy), 0.01) };
}

function apply(forces: Point[], a: number, b: number, fx: number, fy: number) {
  forces[a]!.x += fx;
  forces[a]!.y += fy;
  forces[b]!.x -= fx;
  forces[b]!.y -= fy;
}
