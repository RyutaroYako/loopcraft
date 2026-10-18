import { estimateNodeSizes } from "@loopcraft/core/geometry";
import { autoLayout } from "@loopcraft/core/layout";
import type { Diagram, VariableId } from "@loopcraft/core/schema";
import type { Context } from "../context.ts";
import { writeDiagramFile } from "../files.ts";
import { isFailure, loadDiagram } from "../load.ts";
import { done, failure, usageError } from "../outcome.ts";
import type { Outcome } from "../outcome.ts";
import { printData } from "../output.ts";
import { findVariable, layoutReport, printLayoutIssues } from "../summary.ts";

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
  let moved: VariableId[] = unplaced;
  if (options.all) {
    const pinned = new Set<VariableId>();
    for (const ref of options.pin ?? []) {
      const found = findVariable(current, ref);
      if ("error" in found) return usageError(`--pin: ${found.error}`);
      pinned.add(found.id);
    }
    next = autoLayout(current, estimateNodeSizes(current.variables), { fixed: pinned });
    const before = new Map(current.variables.map((variable) => [variable.id, variable.position]));
    moved = next.variables.flatMap((variable) => {
      const old = before.get(variable.id)!;
      return old.x === variable.position.x && old.y === variable.position.y ? [] : [variable.id];
    });
  }

  // 図が変わったかで決めないのは、--all でなければ、読み込みで置いた座標はまだファイルに無いのに、図は変わらないため
  const written = options.all ? next !== current : unplaced.length > 0;
  if (written) await writeDiagramFile(loaded.path, next);
  const report = layoutReport(next);
  const data = { file: shown, written, moved, layout: report };

  // 崩れが残っても成功にしないのは、check と layout が互いを勧め合い、同じ往復を繰り返すため
  if (report.errors > 0) {
    if (options.format === "text") {
      printLayoutIssues(
        log,
        report.issues.filter((issue) => issue.severity === "error"),
      );
    }
    return failure(
      `${written ? "配置しましたが" : "配置は変わりませんでしたが"}、崩れが ${report.errors} 件残っています`,
      {
        code: "LAYOUT_UNRESOLVED",
        suggestions: [
          "それぞれの崩れの hint に沿って、edit の update-variable で position をずらすか、update-link で curvature を付けて直してください",
        ],
        data,
      },
    );
  }
  if (options.format === "json") {
    printData(log, data);
  } else if (written) {
    log.success(`${shown} の ${moved.length} 個の変数を配置しました`);
    if (report.warnings > 0) {
      log.note(
        `  ほかに直したほうがよい点が ${report.warnings} 件あります（loopcraft check ${shown}）`,
      );
    }
  } else if (options.all) {
    log.info("配置は変わりませんでした");
  } else {
    log.info("座標の無い変数はありません。座標のある変数も並べ直すには --all を付けてください");
  }
  return done;
}
