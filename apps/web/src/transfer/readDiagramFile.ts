import { formatDiagramError, parseDiagramJson } from "@loopcraft/core/io";
import type { ParseDiagramResult } from "@loopcraft/core/io";
import type { Diagram } from "@loopcraft/core/schema";

export type DiagramFileResult = { ok: true; diagram: Diagram } | { ok: false; details: string[] };

export const formatParseErrors = (errors: Extract<ParseDiagramResult, { ok: false }>["errors"]) =>
  errors.map(formatDiagramError);

export const readDiagramFile = async (file: File): Promise<DiagramFileResult> => {
  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    return {
      ok: false,
      details: [
        "ファイルを開けませんでした。フォルダや、移動・削除されたファイルは読み込めません",
        String(error),
      ],
    };
  }
  const result = parseDiagramJson(text);
  return result.ok
    ? { ok: true, diagram: result.diagram }
    : { ok: false, details: formatParseErrors(result.errors) };
};
