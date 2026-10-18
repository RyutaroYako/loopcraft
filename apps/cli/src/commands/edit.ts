import { readFile } from "node:fs/promises";
import { createEmptyDiagram } from "@loopcraft/core/io";
import { applyOperations, parseOperation } from "@loopcraft/core/operations";
import type { Operation } from "@loopcraft/core/operations";
import type { Diagram } from "@loopcraft/core/schema";
import type { Context } from "../context.ts";
import { isNotFound, readDiagramFile, writeDiagramFile } from "../files.ts";
import { isFailure, loadDiagram, locate } from "../load.ts";
import { done, failure, usageError } from "../outcome.ts";
import type { Outcome } from "../outcome.ts";
import { printData } from "../output.ts";
import { countKinds, describeLoops, layoutReport, printLayoutIssues } from "../summary.ts";

export interface EditOptions {
  format: "text" | "json";
  dryRun?: boolean;
}

export interface EditDependencies {
  /** 操作を標準入力から読むとき。端末から直接入力されている（パイプでない）なら undefined */
  readStdin: () => Promise<string> | undefined;
}

export async function edit(
  file: string,
  source: string | undefined,
  options: EditOptions,
  context: Context,
  dependencies: EditDependencies,
): Promise<Outcome> {
  const { log } = context;
  const example = `loopcraft edit ${file} - <<'EOF'\n{"op":"add-variable","id":"sales","label":"売上"}\nEOF`;
  let text: string;
  if (source === undefined || source === "-") {
    const pending = dependencies.readStdin();
    if (!pending) {
      return usageError("操作を標準入力か、ファイルで渡してください", { suggestions: [example] });
    }
    text = await pending;
  } else {
    try {
      text = await readFile(locate(source, context).path, "utf8");
    } catch (error) {
      if (!isNotFound(error)) throw error;
      return usageError(`${source} が見つかりません`, { suggestions: [example] });
    }
  }

  const parsed = parseOperations(text);
  if (!Array.isArray(parsed)) {
    return failure(parsed.message, {
      code: "INVALID_OPERATION",
      suggestions: [parsed.hint ?? "操作の書き方は loopcraft edit --help にあります"],
    });
  }
  if (parsed.length === 0) return usageError("操作が 1 つもありません", { suggestions: [example] });

  const { path, shown } = locate(file, context);
  let diagram: Diagram;
  let created = false;
  if ((await readDiagramFile(path)).status === "missing") {
    diagram = createEmptyDiagram();
    created = true;
  } else {
    const loaded = await loadDiagram(file, context);
    if (isFailure(loaded)) return loaded;
    diagram = loaded.diagram;
  }

  const applied = applyOperations(
    diagram,
    parsed.map((item) => item.operation),
  );
  if (!applied.ok) {
    const at = parsed[applied.error.index]!;
    return failure(`${at.line} 行目（${at.operation.op}）: ${applied.error.message}`, {
      code: "INVALID_OPERATION",
      suggestions: [
        ...(applied.error.hint ? [applied.error.hint] : []),
        "どの操作も反映していません。直してから、すべての操作をもう一度渡してください",
      ],
    });
  }
  if (!options.dryRun) await writeDiagramFile(path, applied.diagram);

  const { rows } = describeLoops(applied.diagram);
  const layout = layoutReport(applied.diagram);
  const data = {
    file: shown,
    written: !options.dryRun,
    created,
    applied: parsed.length,
    ids: applied.ids,
    variables: applied.diagram.variables.length,
    links: applied.diagram.links.length,
    loops: countKinds(rows),
    layout: {
      errors: layout.errors,
      warnings: layout.warnings,
      issues: layout.issues.filter((issue) => issue.severity === "error"),
    },
  };
  if (options.format === "json") {
    printData(log, data);
    return done;
  }
  const verb = options.dryRun
    ? "反映できます（--dry-run なので書き込んでいません）"
    : "反映しました";
  log.success(`${shown} に ${parsed.length} 件の操作を${verb}`);
  for (const [index, id] of applied.ids.entries()) {
    if (id !== null) log.note(`  ${parsed[index]!.operation.op}: ${id}`);
  }
  log.info(
    `変数 ${data.variables}・関連 ${data.links}・ループ R ${data.loops.R} / B ${data.loops.B}`,
  );
  printLayoutIssues(log, data.layout.issues);
  return done;
}

interface ParsedOperation {
  line: number;
  operation: Operation;
}

/** 1 行に 1 つの JSON（JSONL）か、操作を並べた JSON の配列を受け付ける */
function parseOperations(text: string): ParsedOperation[] | { message: string; hint?: string } {
  const trimmed = text.trim();
  const items: { line: number; value: unknown }[] = [];
  if (trimmed.startsWith("[")) {
    try {
      const values = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(values)) return { message: "操作の配列として読めません" };
      items.push(...values.map((value, at) => ({ line: at + 1, value })));
    } catch (error) {
      return { message: `JSON として読めません（${String(error)}）` };
    }
  } else {
    for (const [at, line] of text.split("\n").entries()) {
      if (line.trim() === "") continue;
      try {
        items.push({ line: at + 1, value: JSON.parse(line) });
      } catch {
        return {
          message: `${at + 1} 行目を JSON として読めません`,
          hint: "操作は 1 行に 1 つの JSON で書きます。途中で改行しないでください",
        };
      }
    }
  }
  const operations: ParsedOperation[] = [];
  for (const { line, value } of items) {
    const result = parseOperation(value);
    if (!result.ok) {
      return {
        message: `${line} 行目: ${result.message}`,
        ...(result.hint ? { hint: result.hint } : {}),
      };
    }
    operations.push({ line, operation: result.operation });
  }
  return operations;
}
