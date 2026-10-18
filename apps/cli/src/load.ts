import { relative, resolve } from "node:path";
import { formatDiagramError } from "@loopcraft/core/io";
import type { Diagram, VariableId } from "@loopcraft/core/schema";
import type { Context } from "./context.ts";
import { readDiagramFile } from "./files.ts";
import type { Revision } from "@loopcraft/core/session";
import { failure } from "./outcome.ts";
import type { Failure } from "./outcome.ts";

export interface LoadedDiagram {
  path: string;
  /** cwd からの相対パス。メッセージや提案するコマンドに使う */
  shown: string;
  diagram: Diagram;
  revision: Revision;
  unplaced: VariableId[];
}

export function locate(file: string, { cwd }: Context) {
  const path = resolve(cwd, file);
  return { path, shown: relative(cwd, path) || file };
}

export async function loadDiagram(
  file: string,
  context: Context,
): Promise<LoadedDiagram | Failure> {
  const { path, shown } = locate(file, context);
  const loaded = await readDiagramFile(path);
  if (loaded.status === "missing") {
    return failure(`${shown} が見つかりません`, {
      code: "FILE_NOT_FOUND",
      suggestions: [`loopcraft edit ${shown} - で操作を並べると、新しく作れます`],
    });
  }
  if (loaded.status === "invalid") {
    return failure(
      `${shown} を開けません\n  ${loaded.errors.map(formatDiagramError).join("\n  ")}`,
      {
        code: "INVALID_DIAGRAM",
        suggestions: [`loopcraft check ${shown} --format json で、直す場所と直し方を一覧できます`],
        data: { file: shown, errors: loaded.errors },
      },
    );
  }
  return {
    path,
    shown,
    diagram: loaded.diagram,
    revision: loaded.revision,
    unplaced: loaded.unplaced,
  };
}

export function isFailure(value: object): value is Failure {
  return "kind" in value;
}
