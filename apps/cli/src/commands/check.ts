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
  findVariable,
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
  const failures = expectation ? compare(expectation, diagram, rows, truncated) : [];
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
    const summary = `${shown}: 変数 ${data.variables}・関連 ${data.links}・ループ R ${kinds.R} / B ${kinds.B}`;
    if (passed) log.success(summary);
    else log.info(summary);
    if (truncated) log.warn(`ループが多いため、先頭の ${rows.length} 件だけを数えています`);
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
        ...(layout.issues.some((issue) => issue.kind === "overlap")
          ? [`loopcraft layout ${shown} --all で並べ直すと、重なりを直せます`]
          : []),
        // 突き抜けに layout --all を勧めないのは、並べ直しても残ることがあり、同じ案内を繰り返すため
        ...(layout.issues.some((issue) => issue.kind === "link-through")
          ? [
              "突き抜けは、それぞれの hint に沿って、edit の update-variable で position をずらすか、update-link で curvature を付けて直してください",
            ]
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

/** 合否だけを返さないのは、どこが違うかの見比べを読み手に任せると、数が多いときに見落とすため */
function compare(
  expectation: Expectation,
  diagram: Diagram,
  rows: readonly LoopRow[],
  truncated: boolean,
): string[] {
  const failures: string[] = [];
  const counts = countKinds(rows);
  const expectCount = (name: string, expected: number | undefined, actual: number) => {
    if (expected !== undefined && expected !== actual) {
      failures.push(`${name}: ${expected} を期待しましたが ${actual} でした`);
    }
  };
  expectCount("variables", expectation.variables, diagram.variables.length);
  expectCount("links", expectation.links, diagram.links.length);
  // 数えた分だけで比べないのは、打ち切った数がたまたま期待と合うと、誤って通すため
  if (truncated && expectation.loops) {
    failures.push("loops: ループが多く、すべては数えられないので、数を判定できません");
  } else {
    expectCount("loops.R", expectation.loops?.R, counts.R);
    expectCount("loops.B", expectation.loops?.B, counts.B);
  }

  for (const [index, wanted] of (expectation.has ?? []).entries()) {
    const resolved = wanted.through.map((ref) => findVariable(diagram, ref));
    const problems = resolved.flatMap((item) => ("error" in item ? [item.error] : []));
    if (problems.length > 0) {
      failures.push(`has.${index}: ${problems.join("、")}`);
      continue;
    }
    const ids = resolved.flatMap((item) => ("id" in item ? [item.id] : []));
    // 変数の集まりだけで比べないのは、同じ変数を逆向きに回るループが別にあり、種類も違いうるため
    const wantedKey = routeKey(ids);
    const match = rows.find((row) => routeKey(row.variables) === wantedKey);
    const route = wanted.through.join(" → ");
    if (!match) {
      failures.push(
        `has.${index}: ${route} を通るループがありません${truncated ? "（ループが多く、すべては数えていません）" : ""}`,
      );
    } else if (wanted.kind && match.kind !== wanted.kind) {
      failures.push(
        `has.${index}: ${route} は ${wanted.kind} を期待しましたが ${match.kind} でした（極性の - の数を確かめてください）`,
      );
    }
  }
  return failures;
}

function routeKey(variables: readonly VariableId[]) {
  const start = variables.indexOf(variables.toSorted()[0]!);
  return JSON.stringify([...variables.slice(start), ...variables.slice(0, start)]);
}
