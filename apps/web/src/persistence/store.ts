import type { Diagram } from "@loopcraft/core/schema";
import { storeDiagram, watchOtherTabs } from "./storage.ts";

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: "failed"; error: unknown }
  | { ok: false; reason: "conflict" }
  /** ページを読み込み直すまで保存できない（serve を止めた・起動し直したなど） */
  | { ok: false; reason: "disconnected" };

export type ReloadResult =
  | { ok: true; diagram: Diagram }
  /** 読み直せない保存先では problems が空 */
  | { ok: false; problems: string[] };

export interface WatchHandlers {
  change(): void;
  /** unwatched でも保存はできる */
  lost(reason: "disconnected" | "unwatched", detail?: string): void;
  restored(): void;
}

export interface DocumentStore {
  readonly kind: "browser" | "file";
  readonly label: string;
  save(diagram: Diagram, options?: { force?: boolean; keepalive?: boolean }): Promise<SaveResult>;
  watch(handlers: WatchHandlers): () => void;
  reload(): Promise<ReloadResult>;
}

export const createBrowserStore = (): DocumentStore => {
  return {
    kind: "browser",
    label: "ブラウザ",
    save: async (diagram) => {
      const result = storeDiagram(diagram);
      return result.ok ? { ok: true } : { ok: false, reason: "failed", error: result.error };
    },
    watch: (handlers) => watchOtherTabs(() => handlers.change()),
    // 取り込まずに再読み込みを促すのは、別のタブの内容を黙って取り込むと、このタブの取り消し履歴と食い違うため
    reload: async () => ({ ok: false, problems: [] }),
  };
};
