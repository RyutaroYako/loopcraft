import {
  centroid,
  defaultCurvature,
  estimateLabelWidth,
  linkGeometry,
  quadraticPoint,
} from "./geometry.ts";
import type { Size } from "./geometry.ts";
import { linkPairKey } from "./integrity.ts";
import type { Diagram, LoopId, Point, VariableId } from "./schema.ts";

/** 画面と書き出しで描く、ループ記号の円の半径 */
const MARKER_RADIUS = 26;
/** 記号の下に添える名前の、文字の中心の高さと、縁取りを含めた半分の高さ */
const NAME_Y = 37;
const NAME_RADIUS = 9;
/** 名前の文字の大きさは、変数の名前（14px）より小さい 12px */
const NAME_SCALE = 12 / 14;
/** 極性の印の半径（11）に縁取りを足したもの */
const POLARITY_RADIUS = 13;
/** これより離れていれば、どこに置いても同じとみなし、ループの中心に近い方を選ぶ */
const ENOUGH = 32;
const CURVE_STEPS = 8;
const COARSE = 24;
const FINE = 8;
const REFINED = 3;

/** 記号と名前を、記号の中心から見た円の集まりで覆う。矩形で持たないのは、矢印との距離を測るのが円の方が速く簡単なため */
interface Disc {
  x: number;
  y: number;
  r: number;
}

const footprint = (name: string): Disc[] => {
  const discs: Disc[] = [{ x: 0, y: 0, r: MARKER_RADIUS }];
  if (!name) return discs;
  const half = (estimateLabelWidth(name) * NAME_SCALE) / 2;
  const count = Math.max(1, Math.ceil((half * 2) / NAME_RADIUS));
  for (let step = 0; step <= count; step++) {
    discs.push({ x: -half + (half * 2 * step) / count, y: NAME_Y, r: NAME_RADIUS });
  }
  return discs;
};

interface Obstacles {
  boxes: { center: Point; size: Size }[];
  segments: [Point, Point][];
  labels: Point[];
  markers: Disc[];
}

/** 置き直すループの記号の位置。置き直さないループの記号は、今の位置のまま避ける */
export const placeMarkers = (
  diagram: Diagram,
  sizes: ReadonlyMap<VariableId, Size>,
  fallback: Size,
  replace: ReadonlySet<LoopId>,
): Map<LoopId, Point> => {
  const variableById = new Map(diagram.variables.map((variable) => [variable.id, variable]));
  const boxOf = (id: VariableId) => ({
    center: variableById.get(id)!.position,
    size: sizes.get(id) ?? fallback,
  });
  const all: Obstacles = {
    boxes: diagram.variables.map((variable) => boxOf(variable.id)),
    segments: [],
    labels: [],
    markers: [],
  };
  // 関連を直線とみなさないのは、逆向きの関連があると曲線で描かれ、記号がその曲線に重なりうるため
  const pairs = new Set(diagram.links.map((link) => linkPairKey(link.from, link.to)));
  for (const link of diagram.links) {
    const curvature =
      link.curvature ?? defaultCurvature(pairs.has(linkPairKey(link.to, link.from)));
    const { start, control, end, label } = linkGeometry(
      boxOf(link.from),
      boxOf(link.to),
      curvature,
    );
    // 直線を分けないのは、分けても距離は変わらず、調べる数だけが増えるため
    const steps = curvature === 0 ? 1 : CURVE_STEPS;
    let previous = start;
    for (let step = 1; step <= steps; step++) {
      const point = quadraticPoint(start, control, end, step / steps);
      all.segments.push([previous, point]);
      previous = point;
    }
    all.labels.push(label);
  }

  const fromByLink = new Map(diagram.links.map((link) => [link.id, link.from]));
  const polygonOf = (loop: Diagram["loops"][number]) =>
    loop.links.map((id) => variableById.get(fromByLink.get(id)!)!.position);
  const occupy = (discs: readonly Disc[], at: Point) => {
    for (const disc of discs) all.markers.push({ ...disc, x: disc.x + at.x, y: disc.y + at.y });
  };
  for (const loop of diagram.loops) {
    if (!replace.has(loop.id))
      occupy(footprint(loop.name), loop.marker ?? centroid(polygonOf(loop)));
  }
  const markers = new Map<LoopId, Point>();
  for (const loop of diagram.loops) {
    if (!replace.has(loop.id)) continue;
    const polygon = polygonOf(loop);
    const discs = footprint(loop.name);
    const marker = bestPoint(polygon, discs, near(all, polygon, discs, OUTSIDE));
    const rounded = { x: Math.round(marker.x), y: Math.round(marker.y) };
    occupy(discs, rounded);
    markers.set(loop.id, rounded);
  }
  return markers;
};

/** 記号をどこに置いても届かない障害物を、先に除いておく */
const near = (
  all: Obstacles,
  polygon: readonly Point[],
  discs: readonly Disc[],
  margin: number,
): Obstacles => {
  const reach =
    margin + ENOUGH + Math.max(...discs.map((disc) => Math.hypot(disc.x, disc.y) + disc.r));
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const min = { x: Math.min(...xs) - reach, y: Math.min(...ys) - reach };
  const max = { x: Math.max(...xs) + reach, y: Math.max(...ys) + reach };
  const overlaps = (low: Point, high: Point) =>
    low.x <= max.x && high.x >= min.x && low.y <= max.y && high.y >= min.y;
  return {
    boxes: all.boxes.filter(({ center, size }) =>
      overlaps(
        { x: center.x - size.width / 2, y: center.y - size.height / 2 },
        { x: center.x + size.width / 2, y: center.y + size.height / 2 },
      ),
    ),
    segments: all.segments.filter(([a, b]) =>
      overlaps(
        { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
        { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
      ),
    ),
    labels: all.labels.filter((label) => overlaps(label, label)),
    markers: all.markers.filter((disc) =>
      overlaps(
        { x: disc.x - disc.r, y: disc.y - disc.r },
        { x: disc.x + disc.r, y: disc.y + disc.r },
      ),
    ),
  };
};

/** ループの内に空きが無いとき、外のどこまで探すか */
const OUTSIDE = 96;

interface Candidate {
  point: Point;
  score: number;
  away: number;
}

/**
 * まずループの内で探し、内に空きが無ければ外のすぐそばで探す。
 * 内だけで探さないのは、細長いループでは内のどこに置いても変数や矢印に重なるため
 */
const bestPoint = (polygon: readonly Point[], discs: readonly Disc[], obstacles: Obstacles) => {
  const center = centroid(polygon);
  const inside = search(center, polygon, 0, discs, obstacles, (point) =>
    insidePolygon(point, polygon),
  );
  if (inside && inside.score >= 0) return inside.point;
  const outside = search(center, polygon, OUTSIDE, discs, obstacles, () => true);
  if (outside && (!inside || outside.score > inside.score)) return outside.point;
  return inside?.point ?? center;
};

const better = (a: Candidate, b: Candidate) => b.score - a.score || a.away - b.away;

/**
 * 一度に細かく探さないのは、ループが大きいと調べる点が多く、整列が目に見えて遅くなるため。
 * 粗く探して良かった点のまわりだけを細かく探す
 */
const search = (
  center: Point,
  polygon: readonly Point[],
  margin: number,
  discs: readonly Disc[],
  obstacles: Obstacles,
  allowed: (point: Point) => boolean,
): Candidate | undefined => {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const candidates: Candidate[] = [];
  const consider = (point: Point, floor: number) => {
    if (!allowed(point)) return;
    const score = clearance(point, discs, obstacles, floor);
    if (score < floor) return;
    candidates.push({ point, score, away: distance(point, center) });
  };

  // 打ち切りの基準を、これまでで REFINED 番目に良い点にするのは、細かく探す候補を残すため
  let floor = -Infinity;
  for (let x = Math.min(...xs) - margin; x <= Math.max(...xs) + margin; x += COARSE) {
    for (let y = Math.min(...ys) - margin; y <= Math.max(...ys) + margin; y += COARSE) {
      consider({ x, y }, floor);
      if (candidates.length >= REFINED) {
        floor = candidates.map((candidate) => candidate.score).sort((a, b) => b - a)[REFINED - 1]!;
      }
    }
  }
  if (candidates.length === 0) return undefined;
  const seeds = candidates.sort(better).slice(0, REFINED);
  let best = seeds[0]!;
  for (const seed of seeds) {
    for (let dx = -COARSE; dx <= COARSE; dx += FINE) {
      for (let dy = -COARSE; dy <= COARSE; dy += FINE) {
        const start = candidates.length;
        consider({ x: seed.point.x + dx, y: seed.point.y + dy }, best.score);
        for (const found of candidates.slice(start)) if (better(found, best) < 0) best = found;
      }
    }
  }
  return best;
};

/** floor を下回ると分かった時点で打ち切るのは、残りの障害物を調べても選ばれないため */
const clearance = (point: Point, discs: readonly Disc[], obstacles: Obstacles, floor: number) => {
  let nearest = ENOUGH;
  for (const disc of discs) {
    const at = { x: point.x + disc.x, y: point.y + disc.y };
    for (const { center, size } of obstacles.boxes) {
      nearest = Math.min(nearest, boxDistance(at, center, size) - disc.r);
    }
    for (const [a, b] of obstacles.segments) {
      nearest = Math.min(nearest, segmentDistance(at, a, b) - disc.r);
    }
    for (const label of obstacles.labels) {
      nearest = Math.min(nearest, distance(at, label) - POLARITY_RADIUS - disc.r);
    }
    for (const other of obstacles.markers) {
      nearest = Math.min(nearest, distance(at, other) - other.r - disc.r);
    }
    if (nearest < floor) return nearest;
  }
  return nearest;
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
