import { estimateNodeSizes } from "@loopcraft/core/geometry";
import { autoLayout } from "@loopcraft/core/layout";
import type { Diagram, VariableId } from "@loopcraft/core/schema";
import type { Context } from "../context.ts";
import { writeDiagramFile } from "../files.ts";
import { isFailure, loadDiagram } from "../load.ts";
import { done, usageError } from "../outcome.ts";
import type { Outcome } from "../outcome.ts";
import { printData } from "../output.ts";
import { layoutReport, printLayoutIssues } from "../summary.ts";

export interface LayoutCommandOptions {
  format: "text" | "json";
  /** 座標のある変数も含めて並べ直す */
  all?: boolean;
  /** --all でも動かさない変数（ID かラベル） */
  pin?: string[];
}

export async function layout(
  file: string,
  options: LayoutCommandOptions,
  context: Context,
): Promise<Outcome> {
  const { log } = context;
  if (options.pin && !options.all) {
    return usageError("--pin は --all と一緒に使います", {
      suggestions: [`loopcraft layout ${file} --all --pin ${options.pin.join(",")}`],
    });
  }
  const loaded = await loadDiagram(file, context);
  if (isFailure(loaded)) return loaded;
  const { diagram: current, shown, unplaced } = loaded;

  let next: Diagram = current;
  let placed: VariableId[] = unplaced;
  if (options.all) {
    const pinned = new Set<VariableId>();
    for (const ref of options.pin ?? []) {
      const found =
        current.variables.find((variable) => variable.id === ref) ??
        current.variables.find((variable) => variable.label === ref);
      if (!found) return usageError(`--pin の変数 "${ref}" がありません`);
      pinned.add(found.id);
    }
    next = autoLayout(current, estimateNodeSizes(current.variables), { fixed: pinned });
    const before = new Map(current.variables.map((variable) => [variable.id, variable.position]));
    placed = next.variables.flatMap((variable) => {
      const old = before.get(variable.id)!;
      return old.x === variable.position.x && old.y === variable.position.y ? [] : [variable.id];
    });
  } else if (unplaced.length === 0) {
    const report = layoutReport(current);
    const message =
      "座標の無い変数はありません。座標のある変数も並べ直すには --all を付けてください";
    if (options.format === "json") {
      printData(log, { file: shown, written: false, moved: [], message, layout: report });
    } else {
      log.info(message);
      printLayoutIssues(
        log,
        report.issues.filter((issue) => issue.severity === "error"),
      );
    }
    return done;
  }

  // 座標の無い変数は読み込んだときに置いてあるので、--all でなければそのまま書けばよい
  await writeDiagramFile(loaded.path, next);
  const report = layoutReport(next);
  if (options.format === "json") {
    printData(log, { file: shown, written: true, moved: placed, layout: report });
    return done;
  }
  log.success(`${shown} の ${placed.length} 個の変数を配置しました`);
  printLayoutIssues(
    log,
    report.issues.filter((issue) => issue.severity === "error"),
  );
  if (report.warnings > 0) {
    log.note(
      `  ほかに直したほうがよい点が ${report.warnings} 件あります（loopcraft check ${shown}）`,
    );
  }
  return done;
}
