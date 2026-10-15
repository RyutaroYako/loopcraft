import { cycleKey } from "./loop.ts";
import type {
  Diagram,
  Link,
  LinkId,
  Loop,
  LoopId,
  Point,
  Polarity,
  Variable,
  VariableId,
} from "./schema.ts";

/**
 * どの関数も引数の図を変更しない。
 * 変更が無い（対象が見つからない・既に同じ値）ときは、新しい図を作らず元の図をそのまま返す。
 */

type Patch<T> = Partial<Omit<T, "id">>;

export function createId<T extends string>(prefix: string, taken: { has(id: string): boolean }) {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const suffix = Array.from(bytes, (byte) => (byte % 36).toString(36)).join("");
    const id = `${prefix}_${suffix}`;
    if (!taken.has(id)) return id as T;
  }
}

function replaceById<T extends { id: string }>(
  items: T[],
  id: string,
  update: (item: T) => T,
): T[] | undefined {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return undefined;
  const next = update(items[index]!);
  if (next === items[index]) return undefined;
  return items.with(index, next);
}

function applyPatch<T extends object>(item: T, patch: NoInfer<Patch<T>>): T {
  const entries = Object.entries(patch) as [keyof T, T[keyof T] | undefined][];
  if (entries.every(([key, value]) => item[key] === value)) return item;
  const next = { ...item };
  for (const [key, value] of entries) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next;
}

export function setTitle(diagram: Diagram, title: string): Diagram {
  return diagram.title === title ? diagram : { ...diagram, title };
}

export function setDescription(diagram: Diagram, description: string): Diagram {
  return applyPatch(diagram, { description: description || undefined });
}

export function addVariable(
  diagram: Diagram,
  init: { label: string; position: Point },
): { diagram: Diagram; id: VariableId } {
  const id = createId<VariableId>("v", new Set(diagram.variables.map((variable) => variable.id)));
  const variable: Variable = { id, label: init.label, position: init.position };
  return { diagram: { ...diagram, variables: [...diagram.variables, variable] }, id };
}

export function updateVariable(diagram: Diagram, id: VariableId, patch: Patch<Variable>): Diagram {
  const variables = replaceById(diagram.variables, id, (variable) => applyPatch(variable, patch));
  return variables ? { ...diagram, variables } : diagram;
}

/**
 * 位置を指定したループ記号も、ループの変数の重心が動いた分だけ動かす。
 * 止めたままにすると、ループとの位置関係が崩れる
 */
export function moveVariables(
  diagram: Diagram,
  positions: ReadonlyMap<VariableId, Point>,
): Diagram {
  const shifts = new Map<VariableId, Point>();
  const variables = diagram.variables.map((variable) => {
    const position = positions.get(variable.id);
    if (!position) return variable;
    if (position.x === variable.position.x && position.y === variable.position.y) return variable;
    shifts.set(variable.id, {
      x: position.x - variable.position.x,
      y: position.y - variable.position.y,
    });
    return { ...variable, position };
  });
  if (shifts.size === 0) return diagram;
  const fromByLink = new Map(diagram.links.map((link) => [link.id, link.from]));
  const loops = diagram.loops.map((loop) => {
    if (!loop.marker) return loop;
    let dx = 0;
    let dy = 0;
    for (const link of loop.links) {
      const shift = shifts.get(fromByLink.get(link)!);
      dx += shift?.x ?? 0;
      dy += shift?.y ?? 0;
    }
    const marker = {
      x: Math.round(loop.marker.x + dx / loop.links.length),
      y: Math.round(loop.marker.y + dy / loop.links.length),
    };
    if (marker.x === loop.marker.x && marker.y === loop.marker.y) return loop;
    return { ...loop, marker };
  });
  return { ...diagram, variables, loops };
}

/** 繋がる関連とそれを通るループを残さないのは、参照先の無い関連・ループになるため */
export function removeVariable(diagram: Diagram, id: VariableId): Diagram {
  if (!diagram.variables.some((variable) => variable.id === id)) return diagram;
  const removedLinks = diagram.links.filter((link) => link.from === id || link.to === id);
  return removeLinks(
    { ...diagram, variables: diagram.variables.filter((variable) => variable.id !== id) },
    new Set(removedLinks.map((link) => link.id)),
  );
}

export type AddLinkResult =
  | { ok: true; diagram: Diagram; id: LinkId }
  | { ok: false; reason: "self" | "duplicate" | "unknown-variable"; existing?: LinkId };

export function addLink(
  diagram: Diagram,
  init: { from: VariableId; to: VariableId; polarity?: Polarity },
): AddLinkResult {
  if (init.from === init.to) return { ok: false, reason: "self" };
  const variableIds = new Set<string>(diagram.variables.map((variable) => variable.id));
  if (!variableIds.has(init.from) || !variableIds.has(init.to)) {
    return { ok: false, reason: "unknown-variable" };
  }
  const existing = diagram.links.find((link) => link.from === init.from && link.to === init.to);
  if (existing) return { ok: false, reason: "duplicate", existing: existing.id };
  const id = createId<LinkId>("l", new Set(diagram.links.map((link) => link.id)));
  const link: Link = { id, from: init.from, to: init.to, polarity: init.polarity ?? "+" };
  return { ok: true, diagram: { ...diagram, links: [...diagram.links, link] }, id };
}

export function updateLink(
  diagram: Diagram,
  id: LinkId,
  patch: Patch<Omit<Link, "from" | "to">>,
): Diagram {
  const links = replaceById(diagram.links, id, (link) => applyPatch(link, patch));
  return links ? { ...diagram, links } : diagram;
}

export function togglePolarity(diagram: Diagram, id: LinkId): Diagram {
  const link = diagram.links.find((item) => item.id === id);
  if (!link) return diagram;
  return updateLink(diagram, id, { polarity: link.polarity === "+" ? "-" : "+" });
}

/** それを通るループを残さないのは、閉路でなくなるため */
export function removeLinks(diagram: Diagram, ids: ReadonlySet<LinkId>): Diagram {
  if (ids.size === 0) return diagram;
  return {
    ...diagram,
    links: diagram.links.filter((link) => !ids.has(link.id)),
    loops: diagram.loops.filter((loop) => !loop.links.some((link) => ids.has(link))),
  };
}

export function featureLoop(
  diagram: Diagram,
  links: LinkId[],
  init: { name?: string } = {},
): { diagram: Diagram; id: LoopId } {
  const key = cycleKey(links);
  const existing = diagram.loops.find((loop) => cycleKey(loop.links) === key);
  if (existing) return { diagram, id: existing.id };
  const id = createId<LoopId>("p", new Set(diagram.loops.map((loop) => loop.id)));
  const loop: Loop = { id, name: init.name ?? "", links };
  return { diagram: { ...diagram, loops: [...diagram.loops, loop] }, id };
}

export function updateLoop(
  diagram: Diagram,
  id: LoopId,
  patch: Patch<Omit<Loop, "links">>,
): Diagram {
  const loops = replaceById(diagram.loops, id, (loop) => applyPatch(loop, patch));
  return loops ? { ...diagram, loops } : diagram;
}

export function removeLoop(diagram: Diagram, id: LoopId): Diagram {
  if (!diagram.loops.some((loop) => loop.id === id)) return diagram;
  return { ...diagram, loops: diagram.loops.filter((loop) => loop.id !== id) };
}
