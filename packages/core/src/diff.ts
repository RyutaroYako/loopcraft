import { findLoops } from "./cycles.ts";
import { linkPairKey } from "./integrity.ts";
import type { LoopKind } from "./loop.ts";
import type { Diagram, Link, VariableId } from "./schema.ts";

export interface VariableSummary {
  id: string;
  label: string;
}

export interface LinkSummary {
  id: string;
  from: string;
  to: string;
  polarity: string;
}

export interface LoopSummary {
  kind: "R" | "B";
  /** 変数のラベルを辿る順に並べたもの */
  route: string[];
}

export interface DiagramDiff {
  changed: boolean;
  title?: { before: string; after: string };
  variables: {
    added: VariableSummary[];
    removed: VariableSummary[];
    renamed: { id: string; before: string; after: string }[];
    /** 位置だけが変わった変数の数。並べ直すと数が多くなるので、どれかは出さない */
    moved: number;
  };
  links: {
    added: LinkSummary[];
    removed: LinkSummary[];
    changed: (LinkSummary & { changes: string[] })[];
  };
  /** 自動で見つかるループ。注目しているかどうかは問わない */
  loops: {
    added: LoopSummary[];
    removed: LoopSummary[];
    /** 同じ変数を通るが、極性が変わって種類が変わったもの */
    flipped: (LoopSummary & { before: "R" | "B" })[];
  };
  featured: { added: string[]; removed: string[] };
  /** 構造に関わらない変更（説明・曲がり具合・ループ記号の位置）の場所 */
  other: string[];
}

/**
 * 関連を ID で突き合わせないのは、書き手が ID を付け替えただけで、同じ因果関係を消して足したことになるため
 */
export const diffDiagrams = (before: Diagram, after: Diagram): DiagramDiff => {
  const beforeVariables = new Map(before.variables.map((variable) => [variable.id, variable]));
  const afterVariables = new Map(after.variables.map((variable) => [variable.id, variable]));
  const variables: DiagramDiff["variables"] = { added: [], removed: [], renamed: [], moved: 0 };
  for (const variable of after.variables) {
    const old = beforeVariables.get(variable.id);
    if (!old) {
      variables.added.push({ id: variable.id, label: variable.label });
      continue;
    }
    if (old.label !== variable.label) {
      variables.renamed.push({ id: variable.id, before: old.label, after: variable.label });
    }
    if (old.position.x !== variable.position.x || old.position.y !== variable.position.y) {
      variables.moved++;
    }
  }
  for (const variable of before.variables) {
    if (!afterVariables.has(variable.id)) {
      variables.removed.push({ id: variable.id, label: variable.label });
    }
  }

  const labelIn = (diagram: Diagram) => {
    const labels = new Map(diagram.variables.map((variable) => [variable.id, variable.label]));
    return (id: VariableId) => labels.get(id) || id;
  };
  const beforeLabel = labelIn(before);
  const afterLabel = labelIn(after);
  const summary = (link: Link, label: (id: VariableId) => string): LinkSummary => ({
    id: link.id,
    from: label(link.from),
    to: label(link.to),
    polarity: link.polarity,
  });
  const beforeLinks = new Map(before.links.map((link) => [linkPairKey(link.from, link.to), link]));
  const afterLinks = new Map(after.links.map((link) => [linkPairKey(link.from, link.to), link]));
  const links: DiagramDiff["links"] = { added: [], removed: [], changed: [] };
  for (const [key, link] of afterLinks) {
    const old = beforeLinks.get(key);
    if (!old) {
      links.added.push(summary(link, afterLabel));
      continue;
    }
    const changes = [
      ...(old.polarity === link.polarity ? [] : [`polarity: ${old.polarity} -> ${link.polarity}`]),
      ...(Boolean(old.delay) === Boolean(link.delay)
        ? []
        : [`delay: ${Boolean(old.delay)} -> ${Boolean(link.delay)}`]),
    ];
    if (changes.length > 0) links.changed.push({ ...summary(link, afterLabel), changes });
  }
  for (const [key, link] of beforeLinks) {
    if (!afterLinks.has(key)) links.removed.push(summary(link, beforeLabel));
  }

  const loopsOf = (diagram: Diagram, label: (id: VariableId) => string) =>
    new Map<string, LoopSummary>(
      findLoops(diagram.links).loops.map((loop) => [
        routeKey(loop.variables),
        { kind: badge(loop.kind), route: loop.variables.map(label) },
      ]),
    );
  const beforeLoops = loopsOf(before, beforeLabel);
  const afterLoops = loopsOf(after, afterLabel);
  const loops: DiagramDiff["loops"] = { added: [], removed: [], flipped: [] };
  for (const [key, loop] of afterLoops) {
    const old = beforeLoops.get(key);
    if (!old) loops.added.push(loop);
    else if (old.kind !== loop.kind) loops.flipped.push({ ...loop, before: old.kind });
  }
  for (const [key, loop] of beforeLoops) {
    if (!afterLoops.has(key)) loops.removed.push(loop);
  }

  const names = (diagram: Diagram) => new Set(diagram.loops.map((loop) => loop.name || loop.id));
  const beforeFeatured = names(before);
  const afterFeatured = names(after);
  const featured = {
    added: [...afterFeatured].filter((name) => !beforeFeatured.has(name)),
    removed: [...beforeFeatured].filter((name) => !afterFeatured.has(name)),
  };

  const other = [
    ...(before.description === after.description ? [] : ["description"]),
    ...otherChanges("variables", before.variables, after.variables, ["description"]),
    ...otherChanges("links", before.links, after.links, ["description", "curvature"]),
    ...otherChanges("loops", before.loops, after.loops, ["description", "marker"]),
  ];
  const title =
    before.title === after.title ? undefined : { before: before.title, after: after.title };
  const changed =
    title !== undefined ||
    [variables.added, variables.removed, variables.renamed].some((list) => list.length > 0) ||
    variables.moved > 0 ||
    [links.added, links.removed, links.changed].some((list) => list.length > 0) ||
    [loops.added, loops.removed, loops.flipped].some((list) => list.length > 0) ||
    featured.added.length > 0 ||
    featured.removed.length > 0 ||
    other.length > 0;
  return { changed, ...(title ? { title } : {}), variables, links, loops, featured, other };
};

const otherChanges = <T extends { id: string }>(
  collection: string,
  before: readonly T[],
  after: readonly T[],
  keys: readonly (keyof T & string)[],
) => {
  const old = new Map(before.map((item) => [item.id, item]));
  return after.flatMap((item) => {
    const previous = old.get(item.id);
    if (!previous) return [];
    return keys
      .filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(item[key]))
      .map((key) => `${collection}.${item.id}.${key}`);
  });
};

const badge = (kind: LoopKind): "R" | "B" => (kind === "reinforcing" ? "R" : "B");

/** 回転だけが違う同じ経路は同じ値になる */
const routeKey = (variables: readonly VariableId[]) => {
  let start = 0;
  for (let at = 1; at < variables.length; at++) {
    if (variables[at]! < variables[start]!) start = at;
  }
  return JSON.stringify([...variables.slice(start), ...variables.slice(0, start)]);
};
