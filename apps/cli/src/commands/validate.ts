import { relative, resolve } from "node:path";
import type { Context } from "../context.ts";
import { done, failure, usageError } from "../outcome.ts";
import type { Outcome } from "../outcome.ts";
import { readDiagramFile } from "../files.ts";

export type OutputFormat = "text" | "json";

interface FileResult {
  file: string;
  valid: boolean;
  errors: string[];
}

export async function validate(
  files: string[],
  options: { format: OutputFormat },
  { log, cwd }: Context,
): Promise<Outcome> {
  if (files.length === 0) return usageError("検証するファイルを指定してください");
  const results: FileResult[] = [];
  for (const file of files) {
    const path = resolve(cwd, file);
    const shown = relative(cwd, path) || file;
    const loaded = await readDiagramFile(path).catch((error: unknown) => ({
      status: "unreadable" as const,
      error,
    }));
    if (loaded.status === "ok") results.push({ file: shown, valid: true, errors: [] });
    else if (loaded.status === "missing")
      results.push({ file: shown, valid: false, errors: ["ファイルが見つかりません"] });
    else if (loaded.status === "invalid")
      results.push({ file: shown, valid: false, errors: loaded.errors });
    else results.push({ file: shown, valid: false, errors: [String(loaded.error)] });
  }

  const failed = results.filter((result) => !result.valid);
  if (options.format === "json") {
    log.output(JSON.stringify(results, null, 2));
  } else {
    for (const result of results) {
      if (result.valid) {
        log.success(result.file);
      } else {
        log.error(result.file);
        for (const error of result.errors) log.plain(`  ${error}`);
      }
    }
    log.plain("");
    if (failed.length === 0) log.success(`${results.length} 件のファイルに問題はありません`);
  }
  if (failed.length > 0) {
    return failure(`${results.length} 件中 ${failed.length} 件のファイルにエラーがあります`);
  }
  return done;
}
