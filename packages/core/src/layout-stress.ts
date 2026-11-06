import type { Size } from "./geometry.ts";
import type { Point } from "./schema.ts";

export interface StressInput {
  edges: readonly [number, number][];
  /** ループの変数を、矢印の順に並べたもの */
  cycles: readonly (readonly number[])[];
  sizeOf: (at: number) => Size;
  pinned: readonly boolean[];
  /** つながった 2 つの変数の、中心どうしの距離 */
  idealLength: number;
}

const MAX_ITERATIONS = 300;
const TOLERANCE = 1e-4;
/** ループを輪にする目標を、グラフ上の距離よりどれだけ重く見るか */
const CYCLE_WEIGHT = 2;

/**
 * 力学モデル（Fruchterman–Reingold）でなく stress majorization にするのは、
 * 力学モデルでは中央が詰まって外側が間延びし、図の大きさも交差も増えるため。
 * ループの変数どうしには正多角形の頂点どうしの距離を目標にし、ループが輪に見えるようにする
 */
export const minimizeStress = (positions: Point[], input: StressInput) => {
  const count = positions.length;
  if (count < 2) return;
  const { target, weight } = targets(count, input);
  // 毎回 stress を求めて比べないのは、それだけで変数の数の 2 乗かかるため。動いた量で止める
  const enough = TOLERANCE * input.idealLength * count;
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let moved = 0;
    for (let at = 0; at < count; at++) {
      if (input.pinned[at]) continue;
      const next = majorize(positions, at, target[at]!, weight[at]!);
      moved += Math.hypot(next.x - positions[at]!.x, next.y - positions[at]!.y);
      positions[at] = next;
    }
    if (moved < enough) return;
  }
};

const targets = (count: number, input: StressInput) => {
  const { edges, cycles, sizeOf, idealLength } = input;
  const hops = shortestHops(count, edges);
  // 引数に広げて Math.max に渡さないのは、変数が数百を超えると引数が多すぎて落ちるため
  let farthest = 1;
  for (const row of hops)
    for (const hop of row) if (Number.isFinite(hop)) farthest = Math.max(farthest, hop);
  const target: number[][] = [];
  const weight: number[][] = [];
  for (let a = 0; a < count; a++) {
    target.push([]);
    weight.push([]);
    for (let b = 0; b < count; b++) {
      // つながっていない変数どうしは、いちばん遠い変数どうしより 1 つ先にあるとみなす
      const hop = Number.isFinite(hops[a]![b]!) ? hops[a]![b]! : farthest + 1;
      target[a]![b] = hop * idealLength + (sizeOf(a).width + sizeOf(b).width) / 4;
      weight[a]![b] = a === b ? 0 : 1 / (hop * hop);
    }
  }
  // 小さいループを後に書くのは、いくつものループに入る変数では、小さい輪の形を崩さないため
  for (const cycle of [...cycles].sort((a, b) => b.length - a.length)) {
    const sides = cycle.length;
    if (sides < 3) continue;
    const perimeter = cycle.reduce((sum, at) => sum + idealLength + sizeOf(at).width / 2, 0);
    const radius = perimeter / (2 * Math.PI);
    for (let i = 0; i < sides; i++) {
      for (let j = i + 1; j < sides; j++) {
        const a = cycle[i]!;
        const b = cycle[j]!;
        const chord = 2 * radius * Math.sin((Math.PI * (j - i)) / sides);
        const scale = chord / idealLength;
        target[a]![b] = target[b]![a] = chord;
        weight[a]![b] = weight[b]![a] = CYCLE_WEIGHT / (scale * scale);
      }
    }
  }
  return { target, weight };
};

const shortestHops = (count: number, edges: readonly [number, number][]) => {
  const neighbors: number[][] = Array.from({ length: count }, () => []);
  for (const [a, b] of edges) {
    neighbors[a]!.push(b);
    neighbors[b]!.push(a);
  }
  return Array.from({ length: count }, (_, source) => {
    const hops = Array.from({ length: count }, () => Infinity);
    hops[source] = 0;
    const queue = [source];
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head]!;
      for (const next of neighbors[current]!) {
        if (hops[next] !== Infinity) continue;
        hops[next] = hops[current]! + 1;
        queue.push(next);
      }
    }
    return hops;
  });
};

const majorize = (
  positions: readonly Point[],
  at: number,
  target: readonly number[],
  weight: readonly number[],
): Point => {
  const self = positions[at]!;
  let x = 0;
  let y = 0;
  let total = 0;
  for (const [other, point] of positions.entries()) {
    if (other === at) continue;
    const dx = self.x - point.x;
    const dy = self.y - point.y;
    // 同じ位置に重なっていると向きが決まらないので、ずらす向きを番号で決める
    const length = Math.hypot(dx, dy);
    const ux = length > 0.01 ? dx / length : Math.cos(at);
    const uy = length > 0.01 ? dy / length : Math.sin(at);
    const w = weight[other]!;
    x += w * (point.x + target[other]! * ux);
    y += w * (point.y + target[other]! * uy);
    total += w;
  }
  return total === 0 ? self : { x: x / total, y: y / total };
};
