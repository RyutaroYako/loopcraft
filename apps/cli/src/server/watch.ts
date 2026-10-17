import { existsSync, watch } from "node:fs";
import { realpath } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { describeError } from "./http.ts";

const WATCH_DEBOUNCE_MS = 80;

export interface FileWatchHandlers {
  changed(): void;
  lost(reason: string): void;
}

export interface FileWatch {
  close(): void;
}

export async function watchFile(file: string, handlers: FileWatchHandlers): Promise<FileWatch> {
  // ファイルではなくディレクトリを見るのは、置き換え保存でファイル自体が作り直されるため。
  // シンボリックリンクはリンク自体ではなく、実際に書き換わるリンク先を見る
  const watched = await realpath(file).catch(() => file);
  const directory = dirname(watched);
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let watching = true;

  const watcher = watch(directory, (_event, name) => {
    if (name !== basename(watched)) {
      if (!existsSync(directory)) lose(`${directory} が無くなりました`);
      return;
    }
    clearTimeout(debounce);
    debounce = setTimeout(() => handlers.changed(), WATCH_DEBOUNCE_MS);
  });
  watcher.on("error", (error) => lose(describeError(error)));

  function lose(reason: string) {
    if (!watching) return;
    watching = false;
    watcher.close();
    handlers.lost(reason);
  }

  return {
    close: () => {
      clearTimeout(debounce);
      watching = false;
      watcher.close();
    },
  };
}
