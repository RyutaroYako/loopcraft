import { stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { Context } from "../context.ts";
import { UsageError } from "../errors.ts";
import { startServer, type RunningServer } from "../server/server.ts";
import { resolveWebDir } from "../web-dir.ts";

export const DEFAULT_PORT = 4747;

export interface ServeOptions {
  /** 指定されたら、そのポートが使えないときに別のポートへ逃げない */
  port?: number;
  open?: boolean;
  /** 最初から編集モードで開く */
  edit?: boolean;
  /** 編集モードに切り替えられないようにし、サーバーも書き込みを拒否する */
  readonly?: boolean;
}

export interface ServeDependencies {
  openBrowser?: (url: string) => Promise<unknown>;
  webDir?: string;
}

/** ファイルをブラウザのエディタで開く。ファイルが無ければ空の図で開き、最初の保存で作る */
export async function serve(
  file: string,
  options: ServeOptions,
  { log, cwd }: Context,
  dependencies: ServeDependencies = {},
): Promise<RunningServer> {
  const path = resolve(cwd, file);
  const shown = relative(cwd, path) || file;
  const directory = dirname(path);
  if (!(await isDirectory(directory))) {
    throw new UsageError(`${relative(cwd, directory) || directory} というディレクトリがありません`);
  }
  if (await isDirectory(path)) throw new UsageError(`${shown} はディレクトリです`);
  const webDir = dependencies.webDir ?? resolveWebDir();
  if (!webDir) {
    throw new Error(
      "エディタのファイルが見つかりません。リポジトリから動かすときは先に vp run @loopcraft/web#build を実行してください",
    );
  }

  const common = {
    file: path,
    webDir,
    editable: options.edit ?? false,
    readonly: options.readonly ?? false,
    log,
  };
  let server: RunningServer;
  try {
    server = await startServer({ ...common, port: options.port ?? DEFAULT_PORT });
  } catch (error) {
    if (options.port !== undefined || !isAddressInUse(error)) throw error;
    server = await startServer({ ...common, port: 0 });
  }

  const mode = options.readonly ? "読み取り専用" : options.edit ? "編集モード" : "閲覧モード";
  log.success(`${shown} を開きました（${mode}）`);
  log.info(server.url);
  log.note("  Ctrl+C で終了します");
  if (options.open !== false && dependencies.openBrowser) {
    await dependencies.openBrowser(server.url).catch((error: unknown) => {
      log.warn(`ブラウザを開けませんでした。上の URL を開いてください（${String(error)}）`);
    });
  }
  return server;
}

async function isDirectory(path: string) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function isAddressInUse(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}
