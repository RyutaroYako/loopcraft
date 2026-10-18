import { cycleKey, findCycleError } from "./loop.ts";
import { closest } from "./suggest.ts";
import type { DiagramShape } from "./schema.ts";

export type IntegrityPath = readonly [string | number, ...(string | number)[]];

export interface IntegrityIssue {
  path: IntegrityPath;
  message: string;
  /** 直し方の候補 */
  hint?: string;
}

export const findIntegrityIssues = (diagram: DiagramShape): IntegrityIssue[] => {
  const issues: IntegrityIssue[] = [];

  for (const collection of ["variables", "links", "loops"] as const) {
    const seen = new Set<string>();
    for (const [index, { id }] of diagram[collection].entries()) {
      if (seen.has(id)) {
        issues.push({ path: [collection, index, "id"], message: `ID "${id}" が重複しています` });
      }
      seen.add(id);
    }
  }

  const variableIds = new Set<string>(diagram.variables.map((variable) => variable.id));
  const variableHint = (missing: string) => {
    const labelled = diagram.variables.find((variable) => variable.label === missing);
    if (labelled) return `変数は ID で指します。"${missing}" の ID は "${labelled.id}" です`;
    const near = closest(missing, variableIds);
    return near ? `"${near}" のことですか` : undefined;
  };
  const linkPairs = new Map<string, string>();
  for (const [index, link] of diagram.links.entries()) {
    for (const end of ["from", "to"] as const) {
      if (!variableIds.has(link[end])) {
        issues.push({
          path: ["links", index, end],
          message: `変数 "${link[end]}" は存在しません`,
          hint: variableHint(link[end]),
        });
      }
    }
    if (link.from === link.to) {
      issues.push({ path: ["links", index, "to"], message: "自分自身への関連は作れません" });
    }
    const pair = linkPairKey(link.from, link.to);
    const existing = linkPairs.get(pair);
    if (existing !== undefined) {
      issues.push({
        path: ["links", index],
        message: `"${link.from}" から "${link.to}" への関連が重複しています`,
        hint: `同じ向きの関連は 1 本だけです。極性を変えるときは "${existing}" の polarity を書き換えてください`,
      });
    } else {
      linkPairs.set(pair, link.id);
    }
  }

  const linksById = new Map(diagram.links.map((link) => [link.id, link]));
  const cycles = new Set<string>();
  for (const [index, loop] of diagram.loops.entries()) {
    const error = findCycleError(loop.links, linksById);
    if (error) {
      const id = loop.links[error.index]!;
      const message = {
        "unknown-link": `関連 "${id}" は存在しません`,
        disconnected: "前の関連の行き先と次の関連の出発点が一致しません",
        "revisits-variable": "同じ変数を 2 回通っています",
      }[error.kind];
      issues.push({
        path: ["loops", index, "links", error.index],
        message,
        hint: loopHint(error.kind, id, linksById, variableIds),
      });
      continue;
    }
    const key = cycleKey(loop.links);
    if (cycles.has(key)) {
      issues.push({ path: ["loops", index, "links"], message: "同じループが既に登録されています" });
    }
    cycles.add(key);
  }

  return issues;
};

const loopHint = (
  kind: "unknown-link" | "disconnected" | "revisits-variable",
  id: string,
  linksById: ReadonlyMap<string, { from: string; to: string }>,
  variableIds: ReadonlySet<string>,
): string | undefined => {
  if (kind === "unknown-link") {
    if (variableIds.has(id)) return "loops の links には、変数ではなく関連の ID を並べます";
    const near = closest(id, linksById.keys());
    return near ? `"${near}" のことですか` : undefined;
  }
  if (kind === "disconnected") {
    const to = linksById.get(id)?.to;
    return to === undefined
      ? undefined
      : `次には "${to}" から出る関連を置きます。並びは辿る順で、最後の関連の行き先が最初の関連の出発点に戻ります`;
  }
  return "同じ変数を 2 回通る経路は、そこで 2 つのループに分けて登録します";
};

/** 区切り文字で繋がないのは、ID に区切り文字が含まれると別の組と同じキーになるため */
export const linkPairKey = (from: string, to: string): string => JSON.stringify([from, to]);
