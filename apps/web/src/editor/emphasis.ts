import type { LoopEntry } from "@loopcraft/core/loops";
import type { Link, LinkId, LoopId, VariableId } from "@loopcraft/core/schema";

export type Selection =
  | { kind: "variable"; id: VariableId }
  | { kind: "link"; id: LinkId }
  | { kind: "loop"; id: LoopId };

export interface HighlightedLoop {
  key: string;
  links: ReadonlySet<LinkId>;
  variables: ReadonlySet<VariableId>;
}

export type Emphasis =
  | { kind: "loop"; links: ReadonlySet<LinkId>; variables: ReadonlySet<VariableId> }
  | {
      kind: "neighborhood";
      center: VariableId;
      links: ReadonlySet<LinkId>;
      variables: ReadonlySet<VariableId>;
    };

export const highlightLoop = (
  entries: readonly LoopEntry[],
  keys: { hovered: string | null; selected: string | undefined; focused: string | null },
): HighlightedLoop | undefined => {
  const key = keys.hovered ?? keys.selected ?? keys.focused;
  if (!key) return undefined;
  const entry = entries.find((item) => item.key === key);
  if (!entry) return undefined;
  return { key, links: new Set(entry.links), variables: new Set(entry.variables) };
};

// 矢印の無い変数や名前の入力中にも作ると、足したばかりの変数でほかがすべて薄くなる
export const neighborhoodOf = (
  selection: Selection | null,
  links: readonly Link[],
  editing: VariableId | null,
): Extract<Emphasis, { kind: "neighborhood" }> | undefined => {
  if (selection?.kind !== "variable" || editing !== null) return undefined;
  const variables = new Set<VariableId>([selection.id]);
  const linkIds = new Set<LinkId>();
  for (const link of links) {
    if (link.from !== selection.id && link.to !== selection.id) continue;
    linkIds.add(link.id);
    variables.add(link.from);
    variables.add(link.to);
  }
  return linkIds.size > 0
    ? { kind: "neighborhood", center: selection.id, variables, links: linkIds }
    : undefined;
};

// ループと変数のまわりを別々に描き分けないのは、どちらを優先するかを 1 か所で決めるため
export const emphasisOf = (
  loop: HighlightedLoop | undefined,
  neighborhood: Extract<Emphasis, { kind: "neighborhood" }> | undefined,
): Emphasis | undefined =>
  loop ? { kind: "loop", variables: loop.variables, links: loop.links } : neighborhood;
