import type { Context } from "../context.ts";
import { isFailure, loadDiagram } from "../load.ts";
import { done } from "../outcome.ts";
import type { Outcome } from "../outcome.ts";
import { printData } from "../output.ts";
import { describeLoops, printLoopRows } from "../summary.ts";

export type LoopsFormat = "text" | "json" | "md";
export type LoopKindFilter = "r" | "b";

export async function loops(
  file: string,
  options: { format: LoopsFormat; kind?: LoopKindFilter },
  context: Context,
): Promise<Outcome> {
  const { log } = context;
  const loaded = await loadDiagram(file, context);
  if (isFailure(loaded)) return loaded;
  const { rows: all, truncated } = describeLoops(loaded.diagram);
  const rows = all.filter((row) => !options.kind || row.kind === options.kind.toUpperCase());

  if (options.format === "json") {
    printData(log, { file: loaded.shown, loops: rows, truncated });
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
    printLoopRows(log, rows);
  }
  if (truncated) {
    log.warn(`ループが多いため、先頭の ${all.length} 件だけを数えています`);
  }
  return done;
}

function escapeCell(text: string) {
  return text.replaceAll("|", "\\|");
}
