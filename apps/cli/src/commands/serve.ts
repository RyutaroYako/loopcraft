import { dirname, relative, resolve } from "node:path";
import type { Context } from "../context.ts";
import { failure, usageError } from "../outcome.ts";
import type { Failure } from "../outcome.ts";
import { exists, isDirectory } from "../files.ts";
import { startServer } from "../server/server.ts";
import type { RunningServer } from "../server/server.ts";
import { resolveWebDir } from "../web-dir.ts";

export const DEFAULT_PORT = 4747;

export interface ServeOptions {
  /** 指定されたら、使えなくても別のポートへ逃げない */
  port?: number;
  open?: boolean;
  readonly?: boolean;
  /** 保存するまでファイルは作らない */
  sample?: boolean;
}

export interface ServeDependencies {
  openBrowser?: (url: string) => Promise<unknown>;
  webDir?: string;
  defaultPort?: number;
}

export async function serve(
  file: string,
  options: ServeOptions,
  { log, cwd }: Context,
  dependencies: ServeDependencies = {},
): Promise<{ kind: "serving"; server: RunningServer } | Failure> {
  const path = resolve(cwd, file);
  const shown = relative(cwd, path) || file;
  const directory = dirname(path);
  if (!(await isDirectory(directory))) {
    return usageError(`${relative(cwd, directory) || directory} というディレクトリがありません`);
  }
  if (await isDirectory(path)) return usageError(`${shown} はディレクトリです`);
  if (options.sample && (await exists(path))) {
    return usageError(`${shown} は既にあります。--sample は新しいファイルを開くときに使えます`);
  }
  const webDir = dependencies.webDir ?? resolveWebDir();
  if (!webDir) {
    return failure(
      "エディタのファイルが見つかりません。リポジトリから動かすときは先に vp run @loopcraft/web#build を実行してください",
    );
  }

  const common = {
    file: path,
    webDir,
    readonly: options.readonly ?? false,
    sample: options.sample ?? false,
    log,
  };
  let server: RunningServer;
  try {
    server = await startServer({
      ...common,
      port: options.port ?? dependencies.defaultPort ?? DEFAULT_PORT,
    });
  } catch (error) {
    if (options.port !== undefined || !isAddressInUse(error)) throw error;
    server = await startServer({ ...common, port: 0 });
  }

  log.success(`${shown} を開きました${options.readonly ? "（読み取り専用）" : ""}`);
  log.info(server.url);
  if (options.sample)
    log.note(`  サンプルの図を表示しています。編集して保存すると ${shown} を作ります`);
  if (!options.readonly) {
    log.note("  変更はこのファイルに自動で保存します");
  }
  log.note("  Ctrl+C で終了します");
  if (options.open !== false && dependencies.openBrowser) {
    await dependencies.openBrowser(server.url).catch((error: unknown) => {
      log.warn(`ブラウザを開けませんでした。上の URL を開いてください（${String(error)}）`);
    });
  }
  return { kind: "serving", server };
}

function isAddressInUse(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}
