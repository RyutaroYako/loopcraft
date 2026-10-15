import type { Link, LinkId, Polarity } from "./schema.ts";

/** reinforcing: 自己強化ループ（R） / balancing: バランスループ（B） */
export type LoopKind = "reinforcing" | "balancing";

export function classifyLoop(polarities: Iterable<Polarity>): LoopKind {
  let negatives = 0;
  for (const polarity of polarities) {
    if (polarity === "-") negatives++;
  }
  return negatives % 2 === 1 ? "balancing" : "reinforcing";
}

/** 回転だけが違う同じ閉路は同じ値になる */
export function cycleKey(links: readonly LinkId[]): string {
  if (links.length === 0) return "";
  let start = 0;
  for (let i = 1; i < links.length; i++) {
    if (links[i]! < links[start]!) start = i;
  }
  return JSON.stringify([...links.slice(start), ...links.slice(0, start)]);
}

export type CycleError =
  | { kind: "unknown-link"; index: number }
  | { kind: "disconnected"; index: number }
  | { kind: "revisits-variable"; index: number };

/** links は「前の関連の to = 次の関連の from」の順で並び、最後が最初に戻る */
export function findCycleError(
  links: readonly LinkId[],
  linksById: ReadonlyMap<LinkId, Link>,
): CycleError | undefined {
  const resolved: Link[] = [];
  for (const [index, id] of links.entries()) {
    const link = linksById.get(id);
    if (!link) return { kind: "unknown-link", index };
    resolved.push(link);
  }
  const visited = new Set<string>();
  for (const [index, link] of resolved.entries()) {
    const next = resolved[(index + 1) % resolved.length]!;
    if (link.to !== next.from) return { kind: "disconnected", index };
    if (visited.has(link.from)) return { kind: "revisits-variable", index };
    visited.add(link.from);
  }
  return undefined;
}
