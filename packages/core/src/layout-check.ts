import { centroid, defaultCurvature, linkGeometry, quadraticPoint } from "./geometry.ts";
import type { Size } from "./geometry.ts";
import { linkPairKey } from "./integrity.ts";
import type { Diagram, LinkId, LoopId, Point, VariableId } from "./schema.ts";

/**
 * error は読めなくなる崩れ（重なり・突き抜け）、warning は読めるが直したほうがよい崩れ。
 * 交差を error にしないのは、ループが多い図では避けられないことがあるため
 */
export interface LayoutIssue {
  kind: "overlap" | "link-through" | "crossing" | "label-overlap" | "marker-overlap";
  severity: "error" | "warning";
  message: string;
  hint?: string;
  variables?: VariableId[];
  links?: LinkId[];
  loops?: LoopId[];
}

const CURVE_STEPS = 16;
/** 枠をかすめるだけの線まで数えないよう、枠をこの分だけ縮めて調べる */
const GRAZE = 2;
const POLARITY_RADIUS = 11;
const MARKER_RADIUS = 26;

interface Box {
  id: VariableId;
  center: Point;
  size: Size;
}

export const findLayoutIssues = (
  diagram: Diagram,
  sizes: ReadonlyMap<VariableId, Size>,
): LayoutIssue[] => {
  const boxes: Box[] = diagram.variables.map((variable) => ({
    id: variable.id,
    center: variable.position,
    size: sizes.get(variable.id) ?? { width: 0, height: 0 },
  }));
  const boxById = new Map(boxes.map((box) => [box.id, box]));
  const labelOf = new Map(diagram.variables.map((variable) => [variable.id, variable.label]));
  const name = (id: VariableId) => `"${labelOf.get(id) || id}"`;
  const issues: LayoutIssue[] = [];

  for (const [index, a] of boxes.entries()) {
    for (const b of boxes.slice(index + 1)) {
      const overlapX = (a.size.width + b.size.width) / 2 - Math.abs(a.center.x - b.center.x);
      const overlapY = (a.size.height + b.size.height) / 2 - Math.abs(a.center.y - b.center.y);
      if (overlapX <= 0 || overlapY <= 0) continue;
      issues.push({
        kind: "overlap",
        severity: "error",
        message: `${name(a.id)} と ${name(b.id)} が重なっています（横 ${Math.ceil(overlapX)}px・縦 ${Math.ceil(overlapY)}px）`,
        hint: "loopcraft layout --all で並べ直すか、どちらかの position をずらしてください",
        variables: [a.id, b.id],
      });
    }
  }

  const pairs = new Set(diagram.links.map((link) => linkPairKey(link.from, link.to)));
  const curves = diagram.links.map((link) => {
    const curvature =
      link.curvature ?? defaultCurvature(pairs.has(linkPairKey(link.to, link.from)));
    const geometry = linkGeometry(boxById.get(link.from)!, boxById.get(link.to)!, curvature);
    const points = Array.from({ length: CURVE_STEPS + 1 }, (_, step) =>
      quadraticPoint(geometry.start, geometry.control, geometry.end, step / CURVE_STEPS),
    );
    return { link, points, label: geometry.label };
  });

  for (const { link, points } of curves) {
    for (const box of boxes) {
      if (box.id === link.from || box.id === link.to) continue;
      if (!polylineHitsBox(points, box)) continue;
      issues.push({
        kind: "link-through",
        severity: "error",
        message: `${name(link.from)} → ${name(link.to)} の矢印が ${name(box.id)} を突き抜けています`,
        hint: `${name(box.id)} の position をずらすか、関連 "${link.id}" に curvature を付けて曲げてください`,
        variables: [box.id],
        links: [link.id],
      });
    }
  }

  for (const [index, a] of curves.entries()) {
    for (const b of curves.slice(index + 1)) {
      const ends = new Set([a.link.from, a.link.to]);
      // 端を共有する矢印は、端の近くで必ず接するので数えない
      if (ends.has(b.link.from) || ends.has(b.link.to)) continue;
      if (!polylinesCross(a.points, b.points)) continue;
      issues.push({
        kind: "crossing",
        severity: "warning",
        message: `${name(a.link.from)} → ${name(a.link.to)} と ${name(b.link.from)} → ${name(b.link.to)} の矢印が交差しています`,
        links: [a.link.id, b.link.id],
      });
    }
  }

  for (const [index, { link, label }] of curves.entries()) {
    const hit = boxes.find((box) => boxDistance(label, box) < POLARITY_RADIUS);
    const other = curves
      .slice(index + 1)
      .find((curve) => distance(curve.label, label) < POLARITY_RADIUS * 2);
    if (hit) {
      issues.push({
        kind: "label-overlap",
        severity: "warning",
        message: `${name(link.from)} → ${name(link.to)} の極性の印が ${name(hit.id)} に重なっています`,
        variables: [hit.id],
        links: [link.id],
      });
    }
    if (other) {
      issues.push({
        kind: "label-overlap",
        severity: "warning",
        message: `${name(link.from)} → ${name(link.to)} と ${name(other.link.from)} → ${name(other.link.to)} の極性の印が重なっています`,
        links: [link.id, other.link.id],
      });
    }
  }

  const fromByLink = new Map(diagram.links.map((link) => [link.id, link.from]));
  for (const loop of diagram.loops) {
    const at =
      loop.marker ?? centroid(loop.links.map((link) => boxById.get(fromByLink.get(link)!)!.center));
    const hit = boxes.find((box) => boxDistance(at, box) < MARKER_RADIUS);
    if (!hit) continue;
    issues.push({
      kind: "marker-overlap",
      severity: "warning",
      message: `ループ "${loop.name || loop.id}" の記号が ${name(hit.id)} に重なっています`,
      hint: `ループ "${loop.id}" の marker を変数から離すか、消して自動で置かせてください`,
      variables: [hit.id],
      loops: [loop.id],
    });
  }

  return issues;
};

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const boxDistance = (point: Point, box: Box) => {
  const dx = Math.max(Math.abs(point.x - box.center.x) - box.size.width / 2, 0);
  const dy = Math.max(Math.abs(point.y - box.center.y) - box.size.height / 2, 0);
  return Math.hypot(dx, dy);
};

const polylineHitsBox = (points: readonly Point[], box: Box) => {
  const halfWidth = box.size.width / 2 - GRAZE;
  const halfHeight = box.size.height / 2 - GRAZE;
  if (halfWidth <= 0 || halfHeight <= 0) return false;
  const min = { x: box.center.x - halfWidth, y: box.center.y - halfHeight };
  const max = { x: box.center.x + halfWidth, y: box.center.y + halfHeight };
  for (let at = 1; at < points.length; at++) {
    if (segmentHitsRect(points[at - 1]!, points[at]!, min, max)) return true;
  }
  return false;
};

/** Liang–Barsky の切り取り。線分のどこかが矩形の中に入れば true */
const segmentHitsRect = (a: Point, b: Point, min: Point, max: Point) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let low = 0;
  let high = 1;
  for (const [p, q] of [
    [-dx, a.x - min.x],
    [dx, max.x - a.x],
    [-dy, a.y - min.y],
    [dy, max.y - a.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) low = Math.max(low, t);
    else high = Math.min(high, t);
    if (low > high) return false;
  }
  return true;
};

const polylinesCross = (a: readonly Point[], b: readonly Point[]) => {
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      if (segmentsCross(a[i - 1]!, a[i]!, b[j - 1]!, b[j]!)) return true;
    }
  }
  return false;
};

const segmentsCross = (p1: Point, p2: Point, p3: Point, p4: Point) => {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  // 0 を含めるのは、2 本が分割点のちょうど上で交わると、どちらの積も 0 になるため
  if (d1 === 0 && d2 === 0 && d3 === 0 && d4 === 0) return false;
  return d1 * d2 <= 0 && d3 * d4 <= 0;
};

const cross = (origin: Point, a: Point, b: Point) =>
  (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
