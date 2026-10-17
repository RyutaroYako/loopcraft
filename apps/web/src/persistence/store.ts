import type { Diagram } from "@loopcraft/core/schema";
import { loadStoredDiagram, storeDiagram, watchOtherTabs } from "./storage.ts";

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: "failed"; error: unknown }
  | { ok: false; reason: "conflict" }
  /** ページを読み込み直すまで保存できない（serve を止めた・起動し直したなど） */
  | { ok: false; reason: "disconnected" };

export type Opened =
  | { status: "ok"; diagram: Diagram }
  | { status: "missing" }
  /** raw は、開けなかった内容を書き出せるよう手元に持っているときだけある */
  | { status: "unreadable"; problems: string[]; raw?: string };

export type ReloadResult = { ok: true; diagram: Diagram } | { ok: false; problems: string[] };

export interface WatchHandlers {
  change(): void;
  /** unwatched でも保存はできる */
  lost(reason: "disconnected" | "unwatched", detail?: string): void;
  restored(): void;
}

export interface DocumentStore {
  readonly label: string;
  save(diagram: Diagram, options?: { force?: boolean; keepalive?: boolean }): Promise<SaveResult>;
  watch(handlers: WatchHandlers): () => void;
  reload(): Promise<ReloadResult>;
}

export const createBrowserStore = (): DocumentStore => {
  return {
    label: "ブラウザ",
    save: async (diagram) => {
      const result = storeDiagram(diagram);
      return result.ok ? { ok: true } : { ok: false, reason: "failed", error: result.error };
    },
    watch: (handlers) => watchOtherTabs(() => handlers.change()),
    reload: async () => {
      const opened = loadStoredDiagram();
      if (opened.status === "ok") return { ok: true, diagram: opened.diagram };
      if (opened.status === "missing") {
        return { ok: false, problems: ["保存されていた図が削除されています"] };
      }
      return { ok: false, problems: opened.problems };
    },
  };
};
