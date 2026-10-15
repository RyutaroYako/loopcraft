import { relative, resolve } from "node:path";
import { findLoops } from "@loopcraft/core/cycles";
import { listLoopEntries, type LoopEntry } from "@loopcraft/core/loops";
import type { Diagram } from "@loopcraft/core/schema";
import type { Context } from "../context.ts";
import { FailureError } from "../errors.ts";
import { readDiagramFile } from "../files.ts";

export type LoopsFormat = "text" | "json" | "md";
export type LoopKindFilter = "r" | "b";

export async function loops(
  file: string,
  options: { format: LoopsFormat; kind?: LoopKindFilter },
  { log, cwd }: Context,
) {
  const path = resolve(cwd, file);
  const shown = relative(cwd, path) || file;
  const loaded = await readDiagramFile(path);
  if (loaded.status === "missing") throw new FailureError(`${shown} が見つかりません`);
  if (loaded.status === "invalid") {
    throw new FailureError(`${shown} を開けません\n  ${loaded.errors.join("\n  ")}`);
  }
  const { diagram } = loaded;
  const detection = findLoops(diagram.links);
  const entries = listLoopEntries(diagram.loops, diagram.links, detection.loops).filter(
    (entry) => !options.kind || entry.kind === (options.kind === "r" ? "reinforcing" : "balancing"),
  );
  const rows = entries.map((entry) => describe(entry, diagram));

  if (options.format === "json") {
    log.output(JSON.stringify(rows, null, 2));
  } else if (options.format === "md") {
    log.output("| ループ | 名前 | 経路 |\n| --- | --- | --- |");
    for (const row of rows) {
      log.output(
        `| ${row.badge} | ${escapeCell(row.name)} | ${escapeCell(row.route.join(" → "))} |`,
      );
    }
  } else if (rows.length === 0) {
    log.info("ループはありません");
  } else {
    const width = Math.max(...rows.map((row) => row.badge.length));
    for (const row of rows) {
      const name = row.featured ? row.name : `${row.name}（見出していない）`;
      log.output(`${row.badge.padEnd(width)}  ${name}`);
      log.output(`${" ".repeat(width)}  ${row.route.join(" → ")}`);
    }
  }
  if (detection.truncated) {
    log.warn(`ループが多いため、先頭の ${detection.loops.length} 件だけを数えています`);
  }
}

function describe(entry: LoopEntry, diagram: Diagram) {
  const labels = new Map(diagram.variables.map((variable) => [variable.id, variable.label]));
  const kind = entry.kind === "reinforcing" ? "自己強化ループ" : "バランスループ";
  return {
    badge: entry.featured?.badge ?? (entry.kind === "reinforcing" ? "R" : "B"),
    kind: entry.kind,
    featured: entry.featured !== undefined,
    name: entry.featured?.loop.name || kind,
    route: entry.variables.map((id) => labels.get(id) || "名称未設定"),
  };
}

function escapeCell(text: string) {
  return text.replaceAll("|", "\\|");
}
