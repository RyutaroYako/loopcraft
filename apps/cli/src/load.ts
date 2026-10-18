import { basename, dirname, join, relative, resolve } from "node:path";
import { closest } from "@loopcraft/core/suggest";
import { formatDiagramError } from "@loopcraft/core/io";
import type { Diagram, VariableId } from "@loopcraft/core/schema";
import type { Context } from "./context.ts";
import { listJsonFiles, readDiagramFile } from "./files.ts";
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
    // 新しく作る案内だけにしないのは、パスの打ち間違いでも別のファイルを作らせてしまうため
    const siblings = await listJsonFiles(dirname(path)).catch(() => []);
    const near = closest(basename(path), siblings);
    return failure(`${shown} が見つかりません`, {
      code: "FILE_NOT_FOUND",
      suggestions: [
        ...(near ? [`${join(dirname(shown), near)} のことですか`] : []),
        `新しく作るときは loopcraft edit ${shown} - に操作を渡してください`,
      ],
    });
  }
  if (loaded.status === "invalid") {
    return failure(
      `${shown} を開けません\n  ${loaded.errors.map(formatDiagramError).join("\n  ")}`,
      {
        code: "INVALID_DIAGRAM",
        suggestions: [
          `errors の path の場所を hint に沿って直し、loopcraft validate ${shown} で確かめてください`,
        ],
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
