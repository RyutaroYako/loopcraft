import { formatDiagramError } from "@loopcraft/core/io";
import type { DiagramError } from "@loopcraft/core/io";
import type { Context } from "../context.ts";
import { readDiagramFile } from "../files.ts";
import { locate } from "../load.ts";
import { done, failure, usageError } from "../outcome.ts";
import type { Outcome } from "../outcome.ts";
import { printData } from "../output.ts";

export type OutputFormat = "text" | "json";

interface FileResult {
  file: string;
  valid: boolean;
  errors: DiagramError[];
  /** 座標が無く、読み込むときに自動で配置する変数 */
  unplaced: string[];
}

export async function validate(
  files: string[],
  options: { format: OutputFormat },
  context: Context,
): Promise<Outcome> {
  const { log } = context;
  if (files.length === 0) return usageError("検証するファイルを指定してください");
  const results: FileResult[] = [];
  for (const file of files) {
    const { path, shown } = locate(file, context);
    const loaded = await readDiagramFile(path).catch((error: unknown) => ({
      status: "unreadable" as const,
      error,
    }));
    const invalid = (errors: DiagramError[]) =>
      results.push({ file: shown, valid: false, errors, unplaced: [] });
    if (loaded.status === "ok") {
      results.push({ file: shown, valid: true, errors: [], unplaced: loaded.unplaced });
    } else if (loaded.status === "missing") {
      invalid([{ path: undefined, message: "ファイルが見つかりません" }]);
    } else if (loaded.status === "invalid") {
      invalid(loaded.errors);
    } else {
      invalid([{ path: undefined, message: String(loaded.error) }]);
    }
  }

  const failed = results.filter((result) => !result.valid);
  if (options.format === "text") {
    for (const result of results) {
      if (result.valid) {
        log.success(result.file);
      } else {
        log.error(result.file);
        for (const error of result.errors) log.plain(`  ${formatDiagramError(error)}`);
      }
      if (result.unplaced.length > 0) {
        log.note(
          `  座標の無い変数が ${result.unplaced.length} 個あります。開くときに自動で配置します（書き込むには loopcraft layout ${result.file}）`,
        );
      }
    }
    log.plain("");
    if (failed.length === 0) log.success(`${results.length} 件のファイルに問題はありません`);
  }
  if (failed.length > 0) {
    return failure(`${results.length} 件中 ${failed.length} 件のファイルにエラーがあります`, {
      code: "INVALID_DIAGRAM",
      suggestions: ["errors の path の場所を、hint に沿って直してください"],
      data: { files: results },
    });
  }
  if (options.format === "json") printData(log, { files: results });
  return done;
}
