import { findLoops } from "@loopcraft/core/cycles";
import { estimateNodeSizes, UNNAMED_LABEL } from "@loopcraft/core/geometry";
import { findLayoutIssues } from "@loopcraft/core/layout-check";
import type { LayoutIssue } from "@loopcraft/core/layout-check";
import { listLoopEntries } from "@loopcraft/core/loops";
import type { Diagram, LinkId, VariableId } from "@loopcraft/core/schema";
import type { Logger } from "./log.ts";

export interface LoopRow {
  badge: string;
  kind: "R" | "B";
  featured: boolean;
  /** 注目しているループだけにある */
  id?: string;
  name: string;
  /** 辿る順。最後の変数から最初の変数へ戻る */
  variables: VariableId[];
  route: string[];
  links: LinkId[];
}

export function describeLoops(diagram: Diagram): { rows: LoopRow[]; truncated: boolean } {
  const detection = findLoops(diagram.links);
  const labels = new Map(diagram.variables.map((variable) => [variable.id, variable.label]));
  const rows = listLoopEntries(diagram.loops, diagram.links, detection.loops).map((entry) => {
    const kind = entry.kind === "reinforcing" ? "R" : "B";
    return {
      badge: entry.featured?.badge ?? kind,
      kind,
      featured: entry.featured !== undefined,
      ...(entry.featured ? { id: entry.featured.loop.id } : {}),
      name: entry.featured?.loop.name || (kind === "R" ? "自己強化ループ" : "バランスループ"),
      variables: entry.variables,
      route: entry.variables.map((id) => labels.get(id) || UNNAMED_LABEL),
      links: entry.links,
    } satisfies LoopRow;
  });
  return { rows, truncated: detection.truncated };
}

export function countKinds(rows: readonly LoopRow[]) {
  return {
    R: rows.filter((row) => row.kind === "R").length,
    B: rows.filter((row) => row.kind === "B").length,
  };
}

/**
 * 大きさをエディタのフォントで測らず見積もるのは、CLI では画面のフォントが無いため。
 * 見積もりなので、際どい重なりは画面と食い違うことがある
 */
export function layoutReport(diagram: Diagram) {
  const issues = findLayoutIssues(diagram, estimateNodeSizes(diagram.variables));
  return {
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    issues,
  };
}

export function printLoopRows(log: Logger, rows: readonly LoopRow[]) {
  const width = Math.max(...rows.map((row) => row.badge.length));
  for (const row of rows) {
    const name = row.featured ? row.name : `${row.name}（注目していない）`;
    log.output(`${row.badge.padEnd(width)}  ${name}`);
    log.output(`${" ".repeat(width)}  ${row.route.join(" → ")}`);
  }
}

export function printLayoutIssues(log: Logger, issues: readonly LayoutIssue[]) {
  for (const issue of issues) {
    if (issue.severity === "error") log.error(issue.message);
    else log.warn(issue.message);
    if (issue.hint) log.note(`  ${issue.hint}`);
  }
}
