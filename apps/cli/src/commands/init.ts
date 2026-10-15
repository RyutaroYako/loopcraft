import { dirname, relative, resolve } from "node:path";
import { createEmptyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import type { Context } from "../context.ts";
import { UsageError } from "../errors.ts";
import { exists, isDirectory, writeDiagramFile } from "../files.ts";

export const DEFAULT_FILE = "diagram.json";

export interface InitOptions {
  sample?: boolean;
  title?: string;
  force?: boolean;
}

export async function init(file: string, options: InitOptions, { log, cwd }: Context) {
  const path = resolve(cwd, file);
  const shown = relative(cwd, path) || file;
  const directory = dirname(path);
  if (!(await isDirectory(directory))) {
    throw new UsageError(`${relative(cwd, directory) || directory} というディレクトリがありません`);
  }
  if (!options.force && (await exists(path))) {
    throw new UsageError(`${shown} は既にあります。上書きするには --force を付けてください`);
  }
  const diagram = options.sample ? createSampleDiagram() : createEmptyDiagram(options.title);
  if (options.sample && options.title) diagram.title = options.title;
  await writeDiagramFile(path, diagram);
  log.success(`${shown} を作成しました`);
  log.note(`  loopcraft serve ${shown} で編集できます`);
  return path;
}
