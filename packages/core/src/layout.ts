import { moveVariables, updateLink, updateLoop } from "./edit.ts";
import {
  centroid,
  defaultCurvature,
  estimateNodeSizes,
  NODE_HEIGHT,
  NODE_MIN_WIDTH,
} from "./geometry.ts";
import type { Size } from "./geometry.ts";
import { linkPairKey } from "./integrity.ts";
import {
  curvePoints,
  findLayoutIssues,
  polylineHitsBox,
  polylinesCross,
  segmentHitsBox,
  segmentsCross,
} from "./layout-check.ts";
import type { Box } from "./layout-check.ts";
import { placeMarkers } from "./layout-markers.ts";
import { minimizeStress } from "./layout-stress.ts";
import type { Diagram, DiagramShape, LinkId, Point, VariableId } from "./schema.ts";

/*
 * 初期配置に乱数を使わないのは、毎回同じ結果にするため。
 * 円周へ元の並び順で並べないのは、関連を辿った順ならループの変数が隣り合い、交差の少ない形に落ち着きやすいため。
 */

/** 枠の間ではなく中心同士の距離 */
const IDEAL_LENGTH = 190;
const GAP_X = 40;
const GAP_Y = 56;
const FALLBACK_SIZE: Size = { width: NODE_MIN_WIDTH, height: NODE_HEIGHT };
const BENDS = [0.15, -0.15, 0.25, -0.25, 0.35, -0.35, 0.5, -0.5];

export interface LayoutOptions {
  /** 動かさない変数。1 つでもあれば、それを基準に置くので、図全体の重心は合わせ直さない */
  fixed?: ReadonlySet<VariableId>;
  /** 変数が動いても曲がり具合を残す関連 */
  keepCurvature?: ReadonlySet<LinkId>;
}

export const autoLayout = (
  diagram: Diagram,
  sizes: ReadonlyMap<VariableId, Size>,
  options: LayoutOptions = {},
): Diagram => {
  const variables = diagram.variables;
  const fixed = options.fixed ?? new Set<VariableId>();
  if (variables.every((variable) => fixed.has(variable.id))) return diagram;
  const ids = variables.map((variable) => variable.id);
  const index = new Map(ids.map((id, at) => [id, at]));
  const sizeOf = (at: number) => sizes.get(ids[at]!) ?? FALLBACK_SIZE;
  const pinned = ids.map((id) => fixed.has(id));
  const anchored = pinned.some(Boolean);

  const edges = undirectedEdges(diagram, index);
  const stress = {
    edges,
    cycles: loopCycles(diagram, index),
    sizeOf,
    pinned,
    idealLength: IDEAL_LENGTH,
  };
  const settle = (start: Point[]) => {
    minimizeStress(start, stress);
    removeOverlaps(start, sizeOf, pinned);
    return start;
  };
  const uncross = (start: Point[]) => {
    if (untangle(start, edges, sizeOf, pinned)) removeOverlaps(start, sizeOf, pinned);
    return start;
  };
  const current = variables.map((variable) => ({ ...variable.position }));
  const score = (candidate: readonly Point[]) => crossingScore(candidate, edges, sizeOf);
  let positions: Point[];
  if (anchored) {
    // 動かさない変数があるときに一通りしか試さないのは、その変数のまわりから広げる置き方が一つに決まるため
    positions = uncross(settle(initialAroundNeighbors(current, edges, pinned)));
  } else {
    const scratch = startingVariables(ids.length, edges).map((start) =>
      settle(initialCircle(traversalOrder(ids.length, edges, start), (at) => sizeOf(at).width)),
    );
    const best = Math.min(...scratch.map(score));
    // 今の並びを残せるなら残す。いつも一から組むと、変数を 1 つ足しただけでも図全体が組み変わり、
    // 利用者が覚えた配置が失われるため
    const kept = spacedApart(current, sizeOf) && score(current) <= best ? current : undefined;
    const tidied = kept ?? settle(current.map((point) => ({ ...point })));
    positions =
      kept ??
      uncross(
        score(tidied) <= best ? tidied : scratch.find((candidate) => score(candidate) === best)!,
      );
  }

  // 元の図の重心に合わせ直さないと、整列のたびに表示位置が大きく飛ぶ
  const before = anchored
    ? { x: 0, y: 0 }
    : centroid(variables.map((variable) => variable.position));
  const after = anchored ? { x: 0, y: 0 } : centroid(positions);
  const moved = new Map<VariableId, Point>(
    ids.flatMap((id, at) =>
      pinned[at]
        ? []
        : [
            [
              id,
              {
                x: Math.round(positions[at]!.x - after.x + before.x),
                y: Math.round(positions[at]!.y - after.y + before.y),
              },
            ] as const,
          ],
    ),
  );

  const changed = new Set(
    variables.flatMap((variable) => {
      const to = moved.get(variable.id);
      return to && (to.x !== variable.position.x || to.y !== variable.position.y)
        ? [variable.id]
        : [];
    }),
  );
  // 動いた変数につながる曲がり具合を残さないのは、位置が変わると意味を失うため。
  // 動かなかった矢印まで消さないのは、突き抜けを避けるために付けた曲がりが、並べ直すたびに消えるため
  let next = moveVariables(diagram, moved);
  for (const link of diagram.links) {
    if (!changed.has(link.from) && !changed.has(link.to)) continue;
    if (options.keepCurvature?.has(link.id)) continue;
    next = updateLink(next, link.id, { curvature: undefined });
  }
  next = bendAroundVariables(next, sizes, options.keepCurvature);
  const fromByLink = new Map(diagram.links.map((link) => [link.id, link.from]));
  const reshaped = new Set(
    next.links.flatMap((link, at) => (link === diagram.links[at] ? [] : [link.id])),
  );
  // 動いた所に関わるループだけでなく、記号が変数に重なっているループも置き直す。
  // 今の並びを残すときに、重なった記号まで残さないため
  const crowded = findLayoutIssues(next, sizes).flatMap((issue) =>
    issue.kind === "marker-overlap" ? (issue.loops ?? []) : [],
  );
  const replace = new Set([
    ...crowded,
    ...next.loops.flatMap((loop) =>
      loop.links.some((link) => reshaped.has(link) || changed.has(fromByLink.get(link)!))
        ? [loop.id]
        : [],
    ),
  ]);
  const markers = placeMarkers(next, sizes, FALLBACK_SIZE, replace);
  for (const loop of next.loops) {
    if (!replace.has(loop.id)) continue;
    const marker = markers.get(loop.id);
    // 同じ位置でも差し替えると、整列を繰り返したときに変化の無い編集が生まれる
    if (marker?.x === loop.marker?.x && marker?.y === loop.marker?.y) continue;
    next = updateLoop(next, loop.id, { marker });
  }
  return next;
};

export const placeMissingVariables = (diagram: DiagramShape): Diagram => {
  const placed = new Set<VariableId>();
  const variables = diagram.variables.map((variable) => {
    if (variable.position) {
      placed.add(variable.id);
      return { ...variable, position: variable.position };
    }
    return { ...variable, position: { x: 0, y: 0 } };
  });
  const filled: Diagram = { ...diagram, variables };
  if (placed.size === variables.length) return filled;
  // 書き手が付けた曲がり具合を残すのは、座標を省いた変数につながる関連でも、曲げたい向きは変わらないため
  return autoLayout(filled, estimateNodeSizes(variables), {
    fixed: placed,
    keepCurvature: new Set(
      diagram.links.flatMap((link) => (link.curvature === undefined ? [] : [link.id])),
    ),
  });
};

/**
 * 変数の位置だけでは突き抜けを避けきれないので、突き抜けている矢印を曲げて逃がす。
 * 書き手が付けた曲がり具合でも、突き抜けていれば付け直す。残すと、今の並びを残すときに突き抜けが直らないため
 */
const bendAroundVariables = (
  diagram: Diagram,
  sizes: ReadonlyMap<VariableId, Size>,
  keepCurvature: ReadonlySet<LinkId> = new Set(),
) => {
  const boxes: Box[] = diagram.variables.map((variable) => ({
    id: variable.id,
    center: variable.position,
    size: sizes.get(variable.id) ?? FALLBACK_SIZE,
  }));
  const boxById = new Map(boxes.map((box) => [box.id, box]));
  const pairs = new Set(diagram.links.map((link) => linkPairKey(link.from, link.to)));
  const curveOf = (link: Diagram["links"][number]) =>
    curvePoints(
      boxById.get(link.from)!,
      boxById.get(link.to)!,
      link.curvature ?? defaultCurvature(pairs.has(linkPairKey(link.to, link.from))),
    );
  const curves = new Map(diagram.links.map((link) => [link.id, curveOf(link)]));
  let next = diagram;
  for (const link of diagram.links) {
    if (keepCurvature.has(link.id)) continue;
    const from = boxById.get(link.from)!;
    const to = boxById.get(link.to)!;
    const others = boxes.filter((box) => box !== from && box !== to);
    const clear = (points: readonly Point[]) =>
      others.every((box) => !polylineHitsBox(points, box));
    if (clear(curves.get(link.id)!)) continue;
    const paired = pairs.has(linkPairKey(link.to, link.from));
    const base = defaultCurvature(paired);
    const crossings = (points: readonly Point[]) =>
      diagram.links.filter(
        (other) =>
          other.from !== link.from &&
          other.from !== link.to &&
          other.to !== link.from &&
          other.to !== link.to &&
          polylinesCross(points, curves.get(other.id)!),
      ).length;
    // 逆向きの関連がある矢印を逆へ曲げないのは、対の矢印と重なるため
    const bends = BENDS.filter((curvature) => !paired || curvature > base)
      .map((curvature) => ({ curvature, points: curvePoints(from, to, curvature) }))
      .filter(({ points }) => clear(points));
    let best: { curvature: number; points: Point[]; crossings: number } | undefined;
    for (const bend of bends) {
      const count = crossings(bend.points);
      if (!best || count < best.crossings) best = { ...bend, crossings: count };
    }
    if (!best) continue;
    curves.set(link.id, best.points);
    next = updateLink(next, link.id, { curvature: best.curvature });
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

const loopCycles = (diagram: Diagram, index: ReadonlyMap<VariableId, number>) => {
  const fromByLink = new Map(diagram.links.map((link) => [link.id, link.from]));
  return diagram.loops.map((loop) => loop.links.map((link) => index.get(fromByLink.get(link)!)!));
};

/** 初めの並びを何通り試すか。stress majorization は初めの並びで落ち着く形が変わり、交差の数も変わる */
const STARTS = 4;

/** 先頭の変数から始めないのは、繋がりの多い変数から辿る方が、中心的なループがまとまって並ぶため */
const startingVariables = (count: number, edges: readonly [number, number][]) => {
  const degree = Array.from({ length: count }, () => 0);
  for (const [a, b] of edges) {
    degree[a]!++;
    degree[b]!++;
  }
  return [...degree.keys()].sort((a, b) => degree[b]! - degree[a]! || a - b).slice(0, STARTS);
};

const traversalOrder = (count: number, edges: readonly [number, number][], first: number) => {
  const neighbors: number[][] = Array.from({ length: count }, () => []);
  for (const [a, b] of edges) {
    neighbors[a]!.push(b);
    neighbors[b]!.push(a);
  }
  const visited = new Set<number>();
  const order: number[] = [];
  const starts = [
    first,
    ...[...neighbors.keys()].sort((a, b) => neighbors[b]!.length - neighbors[a]!.length || a - b),
  ];
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

/** 曲線で数えないのは、並びどうしを比べるだけなら順位はまず変わらず、曲線で数えると整列が遅くなるため */
const crossingScore = (
  positions: readonly Point[],
  edges: readonly [number, number][],
  sizeOf: (at: number) => Size,
) => {
  let score = 0;
  for (const [i, [a, b]] of edges.entries()) {
    for (const [at, center] of positions.entries()) {
      if (at === a || at === b) continue;
      // 突き抜けは曲げて直すが、曲げると交差が増えやすいので、交差より重く数える
      if (segmentHitsBox(positions[a]!, positions[b]!, center, sizeOf(at))) score += 3;
    }
    for (const [c, d] of edges.slice(i + 1)) {
      if (c === a || c === b || d === a || d === b) continue;
      if (segmentsCross(positions[a]!, positions[b]!, positions[c]!, positions[d]!)) score += 1;
    }
  }
  return score;
};

const UNTANGLE_ROUNDS = 3;
/** 遠い変数と入れ替えないのは、矢印が長く伸びるだけで、交差がまず減らないため */
const SWAP_NEIGHBORS = 8;
const MOVE_RADII = [0.5, 1, 1.5].map((scale) => scale * IDEAL_LENGTH);
const MOVE_DIRECTIONS = 12;

const roomFor = (
  positions: readonly Point[],
  at: number,
  point: Point,
  sizeOf: (at: number) => Size,
) =>
  positions.every(
    (other, index) =>
      index === at ||
      Math.abs(other.x - point.x) >= (sizeOf(at).width + sizeOf(index).width) / 2 + GAP_X ||
      Math.abs(other.y - point.y) >= (sizeOf(at).height + sizeOf(index).height) / 2 + GAP_Y,
  );

const nearest = (positions: readonly Point[], from: number, count: number) =>
  positions
    .map((point, at) => ({
      at,
      length: Math.hypot(point.x - positions[from]!.x, point.y - positions[from]!.y),
    }))
    .filter(({ at }) => at !== from)
    .sort((a, b) => a.length - b.length || a.at - b.at)
    .slice(0, count)
    .map(({ at }) => at);

/**
 * 突き抜けや交差に関わる変数を、近くの変数と入れ替えたり、まわりの空いた所へ動かしたりして、
 * 減るなら残す。動かしたかを返す。
 * stress だけに任せないのは、変数を分け合うループが多いと、どのループも輪にできる形が無く、
 * 片方のループが 8 の字にねじれたまま落ち着くことがあるため
 */
const untangle = (
  positions: Point[],
  edges: readonly [number, number][],
  sizeOf: (at: number) => Size,
  pinned: readonly boolean[],
) => {
  const incident: number[][] = positions.map(() => []);
  for (const [at, [a, b]] of edges.entries()) {
    incident[a]!.push(at);
    incident[b]!.push(at);
  }
  const hits = (edge: number, at: number) => {
    const [a, b] = edges[edge]!;
    if (at === a || at === b) return false;
    return segmentHitsBox(positions[a]!, positions[b]!, positions[at]!, sizeOf(at));
  };
  const crosses = (one: number, other: number) => {
    const [a, b] = edges[one]!;
    const [c, d] = edges[other]!;
    if (c === a || c === b || d === a || d === b) return false;
    return segmentsCross(positions[a]!, positions[b]!, positions[c]!, positions[d]!);
  };
  // 全体を数え直さないのは、変わるのは動かした変数につながる矢印と、その枠だけで、
  // 全体を数えると大きな図で整列が目に見えて遅くなるため
  const local = (a: number, b: number) => {
    const moved = a === b ? incident[a]! : [...incident[a]!, ...incident[b]!];
    let score = 0;
    for (const edge of moved) {
      for (let at = 0; at < positions.length; at++) if (hits(edge, at)) score += 3;
      for (let other = 0; other < edges.length; other++) {
        if (other === edge) continue;
        // 動いた矢印どうしは 2 度数えないよう、番号の小さい方からだけ数える
        if (other < edge && moved.includes(other)) continue;
        if (crosses(edge, other)) score += 1;
      }
    }
    for (let edge = 0; edge < edges.length; edge++) {
      if (moved.includes(edge)) continue;
      if (hits(edge, a)) score += 3;
      if (b !== a && hits(edge, b)) score += 3;
    }
    return score;
  };
  let changed = false;
  for (let round = 0; round < UNTANGLE_ROUNDS; round++) {
    let improved = false;
    // 崩れに関わらない変数どうしを入れ替えても減らないので、崩れに関わる変数から試す
    const troubled = positions.flatMap((_, at) => (!pinned[at] && local(at, at) > 0 ? [at] : []));
    for (const a of troubled) {
      for (const b of nearest(positions, a, SWAP_NEIGHBORS)) {
        if (pinned[b]) continue;
        const before = local(a, b);
        if (before === 0) continue;
        [positions[a], positions[b]] = [positions[b]!, positions[a]!];
        if (local(a, b) < before) {
          improved = changed = true;
        } else {
          [positions[a], positions[b]] = [positions[b]!, positions[a]!];
        }
      }
      // 入れ替えだけで済ませないのは、別の変数の向こう側へ回り込ませないと解けない交差があるため
      const origin = positions[a]!;
      let best = { point: origin, score: local(a, a) };
      for (const radius of MOVE_RADII) {
        for (let step = 0; step < MOVE_DIRECTIONS; step++) {
          const angle = (2 * Math.PI * step) / MOVE_DIRECTIONS;
          const point = {
            x: origin.x + Math.cos(angle) * radius,
            y: origin.y + Math.sin(angle) * radius,
          };
          if (!roomFor(positions, a, point, sizeOf)) continue;
          positions[a] = point;
          const score = local(a, a);
          if (score < best.score) best = { point, score };
        }
      }
      positions[a] = best.point;
      if (best.point !== origin) improved = changed = true;
    }
    if (!improved) break;
  }
  return changed;
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

/** 同じ角度に置かないのは、同じ変数のまわりに置く変数どうしが重なるため */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const initialAroundNeighbors = (
  current: readonly Point[],
  edges: readonly [number, number][],
  pinned: readonly boolean[],
): Point[] => {
  const neighbors: number[][] = current.map(() => []);
  for (const [a, b] of edges) {
    neighbors[a]!.push(b);
    neighbors[b]!.push(a);
  }
  const positions = current.map((point) => ({ ...point }));
  const placed = new Set(pinned.flatMap((isPinned, at) => (isPinned ? [at] : [])));
  const everyPlaced = centroid([...placed].map((at) => positions[at]!));
  let step = 0;
  for (const at of positions.keys()) {
    if (placed.has(at)) continue;
    const near = neighbors[at]!.filter((other) => placed.has(other));
    const anchor = near.length > 0 ? centroid(near.map((other) => positions[other]!)) : everyPlaced;
    const angle = step * GOLDEN_ANGLE;
    positions[at] = {
      x: anchor.x + Math.cos(angle) * IDEAL_LENGTH,
      y: anchor.y + Math.sin(angle) * IDEAL_LENGTH,
    };
    placed.add(at);
    step++;
  }
  return positions;
};

/** 座標を整数に丸めた分だけ、離す幅に届かないことがある */
const ROUNDING = 1;

const spacedApart = (positions: readonly Point[], sizeOf: (at: number) => Size) =>
  positions.every((pa, a) =>
    positions.slice(a + 1).every((pb, offset) => {
      const b = a + 1 + offset;
      const apartX =
        Math.abs(pb.x - pa.x) >= (sizeOf(a).width + sizeOf(b).width) / 2 + GAP_X - ROUNDING;
      const apartY =
        Math.abs(pb.y - pa.y) >= (sizeOf(a).height + sizeOf(b).height) / 2 + GAP_Y - ROUNDING;
      return apartX || apartY;
    }),
  );

const removeOverlaps = (
  positions: Point[],
  sizeOf: (at: number) => Size,
  pinned: readonly boolean[],
) => {
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
        if (pinned[a] && pinned[b]) continue;
        moved = true;
        const shareA = pinned[a] ? 0 : pinned[b] ? 1 : 0.5;
        const shareB = 1 - shareA;
        if (overlapX < overlapY) {
          const shift = overlapX * (pb.x >= pa.x ? 1 : -1);
          positions[a] = { x: pa.x - shift * shareA, y: pa.y };
          positions[b] = { x: pb.x + shift * shareB, y: pb.y };
        } else {
          const shift = overlapY * (pb.y >= pa.y ? 1 : -1);
          positions[a] = { x: pa.x, y: pa.y - shift * shareA };
          positions[b] = { x: pb.x, y: pb.y + shift * shareB };
        }
      }
    }
    if (!moved) return;
  }
};
