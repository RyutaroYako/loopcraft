import type { DetectedLoop } from "./cycles.ts";
import { classifyLoop, cycleKey } from "./loop.ts";
import type { LoopKind } from "./loop.ts";
import type { Link, LinkId, Loop, VariableId } from "./schema.ts";

export interface LoopEntry {
  key: string;
  links: LinkId[];
  /** links[i] の出発点 */
  variables: VariableId[];
  kind: LoopKind;
  /** badge は R1 / B2 のような番号 */
  featured?: { loop: Loop; badge: string };
}

export const listLoopEntries = (
  loops: readonly Loop[],
  links: readonly Link[],
  detected: readonly DetectedLoop[],
): LoopEntry[] => {
  const linkById = new Map(links.map((link) => [link.id, link]));
  const counters: Record<LoopKind, number> = { reinforcing: 0, balancing: 0 };
  const featured = loops.map((loop): LoopEntry => {
    const kind = classifyLoop(loop.links.map((id) => linkById.get(id)?.polarity ?? "+"));
    counters[kind]++;
    return {
      key: cycleKey(loop.links),
      links: loop.links,
      variables: loop.links.flatMap((id) => {
        const link = linkById.get(id);
        return link ? [link.from] : [];
      }),
      kind,
      featured: { loop, badge: `${kind === "reinforcing" ? "R" : "B"}${counters[kind]}` },
    };
  });
  const featuredKeys = new Set(featured.map((entry) => entry.key));
  return [
    ...featured,
    ...detected
      .filter((loop) => !featuredKeys.has(loop.key))
      .map(({ key, links, variables, kind }) => ({ key, links, variables, kind })),
  ];
};
