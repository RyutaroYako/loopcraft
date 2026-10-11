import { classifyLoop, cycleKey, type LoopKind } from "./loop.ts";
import type { Link, LinkId, VariableId } from "./schema.ts";

export interface DetectedLoop {
  /** cycleKey(links)。保存済みの Loop との対応付けに使う */
  key: string;
  links: LinkId[];
  /** links[i] の出発点。最後の関連は variables[0] に戻る */
  variables: VariableId[];
  kind: LoopKind;
}

export interface CycleSearchResult {
  loops: DetectedLoop[];
  /** 上限に達して打ち切ったか */
  truncated: boolean;
}

export const DEFAULT_CYCLE_LIMIT = 500;

interface Edge {
  to: number;
  link: LinkId;
}

class LimitReached extends Error {}

/**
 * 関連が作る単純閉路（同じ出来事を 2 度通らないループ）をすべて列挙する。
 * 出来事の位置には依存しないので、関連の配列だけを受け取る。
 * Johnson のアルゴリズムを使うので、閉路数に比例した時間で終わる。
 */
export function findLoops(links: readonly Link[], limit = DEFAULT_CYCLE_LIMIT): CycleSearchResult {
  const ids = [...new Set(links.flatMap((link) => [link.from, link.to]))];
  const indexOf = new Map(ids.map((id, index) => [id, index]));
  const polarityOf = new Map(links.map((link) => [link.id, link.polarity]));
  const adjacency: Edge[][] = ids.map(() => []);
  for (const link of links) {
    const from = indexOf.get(link.from)!;
    const to = indexOf.get(link.to)!;
    if (from === to) continue;
    adjacency[from]!.push({ to, link: link.id });
  }

  const found: DetectedLoop[] = [];
  const record = (links: LinkId[], vertices: number[]) => {
    if (found.length >= limit) throw new LimitReached();
    found.push({
      key: cycleKey(links),
      links,
      variables: vertices.map((vertex) => ids[vertex]!),
      kind: classifyLoop(links.map((link) => polarityOf.get(link)!)),
    });
  };

  let truncated = false;
  try {
    let start = 0;
    while (start < ids.length) {
      const component = leastStronglyConnectedComponent(adjacency, start);
      if (!component) break;
      start = Math.min(...component);
      searchCircuits(adjacency, start, new Set(component), record);
      start++;
    }
  } catch (error) {
    if (!(error instanceof LimitReached)) throw error;
    truncated = true;
  }

  found.sort((a, b) => a.links.length - b.links.length || compare(a.key, b.key));
  return { loops: found, truncated };
}

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function searchCircuits(
  adjacency: readonly Edge[][],
  start: number,
  component: ReadonlySet<number>,
  record: (links: LinkId[], vertices: number[]) => void,
) {
  const blocked = new Set<number>();
  const blockedBy = new Map<number, Set<number>>();
  const vertexStack: number[] = [];
  const linkStack: LinkId[] = [];

  const unblock = (vertex: number) => {
    const pending = [vertex];
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (!blocked.delete(current)) continue;
      const waiting = blockedBy.get(current);
      if (!waiting) continue;
      blockedBy.delete(current);
      pending.push(...waiting);
    }
  };

  const circuit = (vertex: number): boolean => {
    let closed = false;
    vertexStack.push(vertex);
    blocked.add(vertex);
    for (const edge of adjacency[vertex]!) {
      if (!component.has(edge.to)) continue;
      linkStack.push(edge.link);
      if (edge.to === start) {
        record([...linkStack], [...vertexStack]);
        closed = true;
      } else if (!blocked.has(edge.to) && circuit(edge.to)) {
        closed = true;
      }
      linkStack.pop();
    }
    if (closed) {
      unblock(vertex);
    } else {
      for (const edge of adjacency[vertex]!) {
        if (!component.has(edge.to)) continue;
        let waiting = blockedBy.get(edge.to);
        if (!waiting) blockedBy.set(edge.to, (waiting = new Set()));
        waiting.add(vertex);
      }
    }
    vertexStack.pop();
    return closed;
  };

  circuit(start);
}

/**
 * 番号が from 以上の頂点だけからなる部分グラフで、2 頂点以上の強連結成分のうち
 * 最小の頂点を含むものを返す（Tarjan のアルゴリズム）。
 */
function leastStronglyConnectedComponent(
  adjacency: readonly Edge[][],
  from: number,
): number[] | undefined {
  const index = new Map<number, number>();
  const lowLink = new Map<number, number>();
  const onStack = new Set<number>();
  const stack: number[] = [];
  let counter = 0;
  let best: number[] | undefined;

  const visit = (vertex: number) => {
    index.set(vertex, counter);
    lowLink.set(vertex, counter);
    counter++;
    stack.push(vertex);
    onStack.add(vertex);
    for (const { to } of adjacency[vertex]!) {
      if (to < from) continue;
      if (!index.has(to)) {
        visit(to);
        lowLink.set(vertex, Math.min(lowLink.get(vertex)!, lowLink.get(to)!));
      } else if (onStack.has(to)) {
        lowLink.set(vertex, Math.min(lowLink.get(vertex)!, index.get(to)!));
      }
    }
    if (lowLink.get(vertex) !== index.get(vertex)) return;
    const component: number[] = [];
    let member: number;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
    } while (member !== vertex);
    if (component.length < 2) return;
    if (!best || Math.min(...component) < Math.min(...best)) best = component;
  };

  for (let vertex = from; vertex < adjacency.length; vertex++) {
    if (!index.has(vertex)) visit(vertex);
  }
  return best;
}
