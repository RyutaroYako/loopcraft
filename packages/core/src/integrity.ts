import { cycleKey, findCycleError } from "./loop.ts";
import type { DiagramShape } from "./schema.ts";

export type IntegrityPath = readonly [string | number, ...(string | number)[]];

export interface IntegrityIssue {
  path: IntegrityPath;
  message: string;
}

/** スキーマの形だけでは表せない、要素間の整合性の違反をすべて列挙する。 */
export function findIntegrityIssues(diagram: DiagramShape): IntegrityIssue[] {
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
  const linkPairs = new Set<string>();
  for (const [index, link] of diagram.links.entries()) {
    for (const end of ["from", "to"] as const) {
      if (!variableIds.has(link[end])) {
        issues.push({
          path: ["links", index, end],
          message: `変数 "${link[end]}" は存在しません`,
        });
      }
    }
    if (link.from === link.to) {
      issues.push({ path: ["links", index, "to"], message: "自分自身への関連は作れません" });
    }
    const pair = linkPairKey(link.from, link.to);
    if (linkPairs.has(pair)) {
      issues.push({
        path: ["links", index],
        message: `"${link.from}" から "${link.to}" への関連が重複しています`,
      });
    }
    linkPairs.add(pair);
  }

  const linksById = new Map(diagram.links.map((link) => [link.id, link]));
  const cycles = new Set<string>();
  for (const [index, loop] of diagram.loops.entries()) {
    const error = findCycleError(loop.links, linksById);
    if (error) {
      const message = {
        "unknown-link": `関連 "${loop.links[error.index]}" は存在しません`,
        disconnected: "前の関連の行き先と次の関連の出発点が一致しません",
        "revisits-variable": "同じ変数を 2 回通っています",
      }[error.kind];
      issues.push({ path: ["loops", index, "links", error.index], message });
      continue;
    }
    const key = cycleKey(loop.links);
    if (cycles.has(key)) {
      issues.push({ path: ["loops", index, "links"], message: "同じループが既に登録されています" });
    }
    cycles.add(key);
  }

  return issues;
}

/** 「原因→結果」の組を表すキー。同じ向きの関連の重複や、逆向きの関連の有無を調べるのに使う */
export function linkPairKey(from: string, to: string): string {
  return JSON.stringify([from, to]);
}
