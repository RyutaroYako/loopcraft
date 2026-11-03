import { estimateNodeSizes } from "@loopcraft/core/geometry";
import { createOperationJsonSchema } from "@loopcraft/core/json-schema";
import { autoLayout } from "@loopcraft/core/layout";
import { applyOperations, parseOperation } from "@loopcraft/core/operations";
import type { Operation } from "@loopcraft/core/operations";
import type { Diagram, VariableId } from "@loopcraft/core/schema";
import * as v from "valibot";
import { OPERATION_EXAMPLES } from "../operation-help.ts";
import { countKinds, describeLoops, findVariable, layoutReport } from "../summary.ts";

export interface ToolFailure {
  failure: string;
}

export interface DiagramAccess {
  read(): Promise<Diagram | ToolFailure>;
  /** 読んでから書くまでに、ほかの保存を割り込ませない */
  update(
    change: (current: Diagram) => Diagram | ToolFailure,
  ): Promise<{ before: Diagram; after: Diagram } | ToolFailure>;
}

export interface ToolReport {
  changed(before: Diagram, after: Diagram): void;
  checked(summary: { loops: { R: number; B: number }; errors: number }): void;
}

export type ToolResult = { ok: true; data: unknown } | { ok: false; message: string };

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(input: unknown): Promise<ToolResult>;
}

const LayoutInput = v.object({ pin: v.optional(v.array(v.string())) });

const OperationsInput = v.object({ operations: v.array(v.unknown()) });

export function createTools(access: DiagramAccess, report: ToolReport): Tool[] {
  const summary = (diagram: Diagram) => {
    const { rows, truncated } = describeLoops(diagram);
    const layout = layoutReport(diagram);
    return {
      variables: diagram.variables.length,
      links: diagram.links.length,
      loops: { ...countKinds(rows), truncated },
      layout: {
        errors: layout.errors,
        warnings: layout.warnings,
        issues: layout.issues.filter((issue) => issue.severity === "error"),
      },
    };
  };

  return [
    {
      name: "get_diagram",
      description:
        "今の図（JSON）と、見つかったループ、配置の崩れを返す。利用者が画面で直していることがあるので、変える前に毎回読む",
      inputSchema: { type: "object", properties: {} },
      async run() {
        const diagram = await access.read();
        if ("failure" in diagram) return { ok: false, message: diagram.failure };
        const { rows, truncated } = describeLoops(diagram);
        const layout = layoutReport(diagram);
        return {
          ok: true,
          data: {
            diagram,
            loops: rows.map(({ badge, name, featured, route }) => ({
              badge,
              name,
              featured,
              route,
            })),
            truncated,
            layout,
          },
        };
      },
    },
    {
      name: "apply_operations",
      description: [
        "操作を並べて図を変える。1 つでも失敗したら何も変えない。",
        "from・to・through・id には、変数の ID かラベルを書ける。例:",
        ...OPERATION_EXAMPLES.map((line) => line.trim()),
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: { operations: { type: "array", items: createOperationJsonSchema() } },
        required: ["operations"],
      },
      async run(input) {
        const parsed = v.safeParse(OperationsInput, input);
        if (!parsed.success)
          return { ok: false, message: "operations に操作の配列を渡してください" };
        const operations: Operation[] = [];
        for (const [index, item] of parsed.output.operations.entries()) {
          const result = parseOperation(item);
          if (!result.ok) {
            return { ok: false, message: failureText(`${index} 番目の操作`, result) };
          }
          operations.push(result.operation);
        }
        if (operations.length === 0) return { ok: false, message: "操作が 1 つもありません" };
        let ids: (string | null)[] = [];
        const updated = await access.update((current) => {
          const applied = applyOperations(current, operations);
          if (!applied.ok) {
            const where =
              applied.error.index === undefined
                ? ""
                : `${applied.error.index} 番目の操作（${operations[applied.error.index]!.op}）`;
            return {
              failure: `${failureText(where, applied.error)}\nどの操作も反映していません`,
            };
          }
          ids = applied.ids;
          return applied.diagram;
        });
        if ("failure" in updated) return { ok: false, message: updated.failure };
        report.changed(updated.before, updated.after);
        return { ok: true, data: { ids, ...summary(updated.after) } };
      },
    },
    {
      name: "layout",
      description: "図全体を自動で並べ直す。pin の変数（ID かラベル）は動かさない",
      inputSchema: {
        type: "object",
        properties: { pin: { type: "array", items: { type: "string" } } },
      },
      async run(input) {
        const parsed = v.safeParse(LayoutInput, input ?? {});
        if (!parsed.success) return { ok: false, message: "pin は文字列の配列です" };
        const updated = await access.update((current) => {
          const pinned = new Set<VariableId>();
          for (const ref of parsed.output.pin ?? []) {
            const found = findVariable(current, ref);
            if ("error" in found) return { failure: `pin: ${found.error}` };
            pinned.add(found.id);
          }
          return autoLayout(current, estimateNodeSizes(current.variables), { fixed: pinned });
        });
        if ("failure" in updated) return { ok: false, message: updated.failure };
        report.changed(updated.before, updated.after);
        return { ok: true, data: summary(updated.after) };
      },
    },
    {
      name: "check",
      description:
        "ループの数と配置の崩れを調べる。崩れ（重なり・矢印の突き抜け）は、hint に沿って update-variable の position か update-link の curvature で直す",
      inputSchema: { type: "object", properties: {} },
      async run() {
        const diagram = await access.read();
        if ("failure" in diagram) return { ok: false, message: diagram.failure };
        const result = summary(diagram);
        const { R, B } = result.loops;
        report.checked({ loops: { R, B }, errors: result.layout.errors });
        return { ok: true, data: { ...result, layout: layoutReport(diagram) } };
      },
    },
  ];
}

const failureText = (where: string, error: { message: string; hint?: string }) =>
  [`${where ? `${where}: ` : ""}${error.message}`, ...(error.hint ? [error.hint] : [])].join("\n");
