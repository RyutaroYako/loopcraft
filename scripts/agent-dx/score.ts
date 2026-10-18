/**
 * 採点に @loopcraft/core を使わないのは、比べる CLI の版ごとに core の判定が変わると、採点の基準まで動いてしまうため
 */

export interface Score {
  passed: boolean;
  checks: Record<string, boolean>;
}

interface Point {
  x: number;
  y: number;
}

interface Variable {
  id: string;
  label: string;
  position?: Point;
}

interface Link {
  id: string;
  from: string;
  to: string;
  polarity: string;
  delay?: boolean;
}

interface Loop {
  id: string;
  name: string;
  links: string[];
}

export interface DiagramFile {
  version: number;
  title: string;
  variables: Variable[];
  links: Link[];
  loops: Loop[];
}

export function readDiagram(text: string | undefined): DiagramFile | undefined {
  if (text === undefined) return undefined;
  try {
    const value = JSON.parse(text) as DiagramFile;
    if (!Array.isArray(value.variables) || !Array.isArray(value.links)) return undefined;
    if (!Array.isArray(value.loops)) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

export function isWellFormed(diagram: DiagramFile) {
  const ids = new Set(diagram.variables.map((variable) => variable.id));
  const linkIds = new Set(diagram.links.map((link) => link.id));
  return (
    diagram.version === 1 &&
    typeof diagram.title === "string" &&
    ids.size === diagram.variables.length &&
    diagram.variables.every((variable) => typeof variable.label === "string") &&
    diagram.links.every(
      (link) =>
        ids.has(link.from) &&
        ids.has(link.to) &&
        link.from !== link.to &&
        (link.polarity === "+" || link.polarity === "-"),
    ) &&
    diagram.loops.every((loop) => loop.links.every((id) => linkIds.has(id)))
  );
}

export function findVariable(diagram: DiagramFile, ...keywords: string[]) {
  return diagram.variables.find((variable) =>
    keywords.some((keyword) => variable.label.includes(keyword)),
  );
}

export function findLink(diagram: DiagramFile, from?: Variable, to?: Variable) {
  if (!from || !to) return undefined;
  return diagram.links.find((link) => link.from === from.id && link.to === to.id);
}

/** 変数の並びで閉路を表し、R / B を極性から決める */
export function cycles(diagram: DiagramFile): { variables: string[]; kind: "R" | "B" }[] {
  const outgoing = new Map<string, Link[]>();
  for (const link of diagram.links) {
    outgoing.set(link.from, [...(outgoing.get(link.from) ?? []), link]);
  }
  const found: { variables: string[]; kind: "R" | "B" }[] = [];
  const order = diagram.variables.map((variable) => variable.id);
  for (const [startIndex, start] of order.entries()) {
    const walk = (current: string, path: string[], negatives: number) => {
      for (const link of outgoing.get(current) ?? []) {
        const next = negatives + (link.polarity === "-" ? 1 : 0);
        if (link.to === start) {
          found.push({ variables: path, kind: next % 2 === 1 ? "B" : "R" });
          continue;
        }
        if (path.includes(link.to)) continue;
        // 一番小さい位置の変数から始まる閉路だけを数え、同じ閉路を重ねて数えない
        if (order.indexOf(link.to) < startIndex) continue;
        walk(link.to, [...path, link.to], next);
      }
    };
    walk(start, [start], 0);
  }
  return found;
}

export function hasCycle(
  diagram: DiagramFile,
  kind: "R" | "B",
  members: (Variable | undefined)[],
): boolean {
  if (members.some((member) => member === undefined)) return false;
  const ids = members.map((member) => member!.id);
  return cycles(diagram).some(
    (cycle) =>
      cycle.kind === kind &&
      cycle.variables.length === ids.length &&
      ids.every((id) => cycle.variables.includes(id)),
  );
}

/** エディタの見た目に近い大きさ。全角は 14px、半角は 8px、左右の余白は 16px ずつ */
function sizeOf(label: string) {
  let width = 0;
  for (const char of label) width += char.codePointAt(0)! > 0xff ? 14 : 8;
  return { width: Math.max(72, width + 32), height: 36 };
}

/**
 * 座標の無い変数があれば配置は採点できないので、読みやすくないものとして数える
 */
export function layoutProblems(diagram: DiagramFile): string[] {
  const boxes = diagram.variables.map((variable) => ({
    id: variable.id,
    center: variable.position,
    size: sizeOf(variable.label),
  }));
  if (boxes.some((box) => box.center === undefined)) return ["座標の無い変数があります"];
  const problems: string[] = [];
  for (const [index, a] of boxes.entries()) {
    for (const b of boxes.slice(index + 1)) {
      const overlapX = (a.size.width + b.size.width) / 2 - Math.abs(a.center!.x - b.center!.x);
      const overlapY = (a.size.height + b.size.height) / 2 - Math.abs(a.center!.y - b.center!.y);
      if (overlapX > 0 && overlapY > 0) problems.push(`${a.id} と ${b.id} が重なっています`);
    }
  }
  const byId = new Map(boxes.map((box) => [box.id, box]));
  for (const link of diagram.links) {
    const from = byId.get(link.from)?.center;
    const to = byId.get(link.to)?.center;
    if (!from || !to) continue;
    for (const box of boxes) {
      if (box.id === link.from || box.id === link.to) continue;
      if (segmentHitsBox(from, to, box.center!, box.size)) {
        problems.push(`${link.id} が ${box.id} を突き抜けています`);
      }
    }
  }
  return problems;
}

/** 曲線を直線とみなし、枠を少し縮めて、かすめるだけの線は数えない */
function segmentHitsBox(
  a: Point,
  b: Point,
  center: Point,
  size: { width: number; height: number },
) {
  const halfWidth = size.width / 2 - 4;
  const halfHeight = size.height / 2 - 4;
  const steps = 64;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (Math.abs(x - center.x) < halfWidth && Math.abs(y - center.y) < halfHeight) return true;
  }
  return false;
}

export function structureOf(diagram: DiagramFile) {
  return JSON.stringify({
    variables: diagram.variables.map(({ id, label }) => ({ id, label })).sort(byId),
    links: diagram.links
      .map(({ id, from, to, polarity, delay }) => ({ id, from, to, polarity, delay: !!delay }))
      .sort(byId),
    loops: diagram.loops.map(({ id, name, links }) => ({ id, name, links })).sort(byId),
  });
}

function byId(a: { id: string }, b: { id: string }) {
  return a.id.localeCompare(b.id);
}
