import type { Logger } from "./log.ts";

/** コマンドに渡す実行環境。テストでは出力先と作業ディレクトリを差し替える */
export interface Context {
  log: Logger;
  cwd: string;
}
