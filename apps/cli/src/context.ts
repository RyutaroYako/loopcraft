import type { Logger } from "./log.ts";

/** process の出力先や cwd を直接使わないのは、テストで差し替えるため */
export interface Context {
  log: Logger;
  cwd: string;
}
