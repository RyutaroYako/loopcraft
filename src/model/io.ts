// 型の不一致など、スキーマ自体が出す検証メッセージを日本語にする
import "@valibot/i18n/ja/schema";
import * as v from "valibot";
import { DIAGRAM_FORMAT_VERSION, DiagramSchema, type Diagram } from "./schema.ts";

export type ParseDiagramResult =
  | { ok: true; diagram: Diagram }
  | { ok: false; errors: { path: string | undefined; message: string }[] };

export function createEmptyDiagram(title = "無題のシステム図"): Diagram {
  return v.parse(DiagramSchema, {
    version: DIAGRAM_FORMAT_VERSION,
    title,
    variables: [],
    links: [],
    loops: [],
  });
}

/** 読み込んだ JSON 文字列を検証し、エラーは「どこが・なぜ」の形で返す。 */
export function parseDiagramJson(text: string): ParseDiagramResult {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      errors: [{ path: undefined, message: `JSON として読み込めません: ${String(error)}` }],
    };
  }
  const result = v.safeParse(DiagramSchema, input, { lang: "ja" });
  if (result.success) return { ok: true, diagram: result.output };
  return {
    ok: false,
    errors: result.issues.map((issue) => ({
      path: v.getDotPath(issue) ?? undefined,
      message: issue.message,
    })),
  };
}

export function stringifyDiagram(diagram: Diagram): string {
  return `${JSON.stringify(diagram, null, 2)}\n`;
}
