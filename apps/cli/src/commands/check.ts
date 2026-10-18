import type { Diagram, VariableId } from "@loopcraft/core/schema";
import * as v from "valibot";
import type { Context } from "../context.ts";
import { formatDiagramError } from "@loopcraft/core/io";
import type { DiagramError } from "@loopcraft/core/io";
import { isFailure, loadDiagram } from "../load.ts";
import { done, failure, usageError } from "../outcome.ts";
import type { Outcome } from "../outcome.ts";
import { printData } from "../output.ts";
import {
  countKinds,
  describeLoops,
  layoutReport,
  printLayoutIssues,
  printLoopRows,
} from "../summary.ts";
import type { LoopRow } from "../summary.ts";

const ExpectSchema = v.strictObject({
  variables: v.optional(v.number()),
  links: v.optional(v.number()),
  loops: v.optional(v.strictObject({ R: v.optional(v.number()), B: v.optional(v.number()) })),
  has: v.optional(
    v.array(
      v.strictObject({
        kind: v.optional(v.picklist(["R", "B"])),
        through: v.pipe(v.array(v.string()), v.minLength(2)),
      }),
    ),
  ),
});

type Expectation = v.InferOutput<typeof ExpectSchema>;

export interface CheckOptions {
  format: "text" | "json";
  expect?: string;
  /** 直すべきものだけを出す */
  compact?: boolean;
}

export async function check(
  file: string,
  options: CheckOptions,
  context: Context,
): Promise<Outcome> {
  const { log } = context;
  const expectation = parseExpectation(options.expect);
  if (typeof expectation === "string") return usageError(expectation, { code: "INVALID_EXPECT" });

  const loaded = await loadDiagram(file, context);
  if (isFailure(loaded)) {
    const errors = (loaded.data as { errors?: DiagramError[] } | undefined)?.errors;
    if (options.format === "text" && errors) {
      log.error(`${file} を開けません`);
      for (const error of errors) log.plain(`  ${formatDiagramError(error)}`);
      return { ...loaded, message: `${errors.length} 件のエラーがあります` };
    }
    return loaded;
  }
  const { diagram, shown, unplaced } = loaded;
  const { rows, truncated } = describeLoops(diagram);
  const layout = layoutReport(diagram);
  const failures = expectation ? compare(expectation, diagram, rows) : [];
  const passed = layout.errors === 0 && failures.length === 0;

  const data = {
    file: shown,
    valid: true,
    variables: diagram.variables.length,
    links: diagram.links.length,
    loops: {
      ...countKinds(rows),
      truncated,
      ...(options.compact ? {} : { list: rows }),
    },
    unplaced,
    layout: {
      errors: layout.errors,
      warnings: layout.warnings,
      issues: options.compact
        ? layout.issues.filter((issue) => issue.severity === "error")
        : layout.issues,
    },
    ...(expectation ? { expect: { passed: failures.length === 0, failures } } : {}),
  };

  if (options.format === "text") {
    const kinds = countKinds(rows);
    log.success(
      `${shown}: 変数 ${data.variables}・関連 ${data.links}・ループ R ${kinds.R} / B ${kinds.B}`,
    );
    if (!options.compact && rows.length > 0) printLoopRows(log, rows);
    if (unplaced.length > 0) {
      log.note(
        `座標の無い変数が ${unplaced.length} 個あり、自動で配置して調べました（書き込むには loopcraft layout ${shown}）`,
      );
    }
    printLayoutIssues(log, data.layout.issues);
    for (const line of failures) log.error(line);
  }

  if (!passed) {
    const reasons = [
      ...(layout.errors > 0 ? [`配置の崩れが ${layout.errors} 件`] : []),
      ...(failures.length > 0 ? [`期待との違いが ${failures.length} 件`] : []),
    ];
    return failure(`${reasons.join("、")}あります`, {
      code: "CHECK_FAILED",
      suggestions: [
        ...(layout.errors > 0
          ? [`loopcraft layout ${shown} --all で並べ直すと、重なりと突き抜けを直せます`]
          : []),
        ...(failures.length > 0
          ? ["expect.failures の項目を見て、変数や関連を直してください"]
          : []),
      ],
      data,
    });
  }
  if (options.format === "json") printData(log, data);
  return done;
}

function parseExpectation(text: string | undefined): Expectation | string | undefined {
  if (text === undefined) return undefined;
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return `--expect を JSON として読めません。例: --expect '{"loops":{"R":2,"B":1}}'`;
  }
  const result = v.safeParse(ExpectSchema, input);
  if (result.success) return result.output;
  const issue = result.issues[0];
  return `--expect の ${v.getDotPath(issue) ?? "値"} が読めません。書けるのは variables, links, loops.R, loops.B, has[].kind, has[].through です`;
}

/** 違いを 1 行ずつ返す。見比べるのを読み手に任せると、数が多いときに見落とすため */
function compare(expectation: Expectation, diagram: Diagram, rows: readonly LoopRow[]): string[] {
  const failures: string[] = [];
  const counts = countKinds(rows);
  const expectCount = (name: string, expected: number | undefined, actual: number) => {
    if (expected !== undefined && expected !== actual) {
      failures.push(`${name}: ${expected} を期待しましたが ${actual} でした`);
    }
  };
  expectCount("variables", expectation.variables, diagram.variables.length);
  expectCount("links", expectation.links, diagram.links.length);
  expectCount("loops.R", expectation.loops?.R, counts.R);
  expectCount("loops.B", expectation.loops?.B, counts.B);

  for (const [index, wanted] of (expectation.has ?? []).entries()) {
    const ids = wanted.through.map((ref) => resolveVariable(diagram, ref));
    const unknown = wanted.through.filter((_, at) => ids[at] === undefined);
    if (unknown.length > 0) {
      failures.push(
        `has.${index}: 変数 ${unknown.map((ref) => `"${ref}"`).join(", ")} がありません`,
      );
      continue;
    }
    const members = new Set(ids);
    const match = rows.find(
      (row) =>
        row.variables.length === members.size && row.variables.every((id) => members.has(id)),
    );
    const route = wanted.through.join(" → ");
    if (!match) {
      failures.push(`has.${index}: ${route} を通るループがありません`);
    } else if (wanted.kind && match.kind !== wanted.kind) {
      failures.push(
        `has.${index}: ${route} は ${wanted.kind} を期待しましたが ${match.kind} でした（極性の - の数を確かめてください）`,
      );
    }
  }
  return failures;
}

function resolveVariable(diagram: Diagram, ref: string): VariableId | undefined {
  return (
    diagram.variables.find((variable) => variable.id === ref) ??
    diagram.variables.find((variable) => variable.label === ref)
  )?.id;
}
