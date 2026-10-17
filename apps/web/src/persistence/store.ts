import type { Diagram } from "@loopcraft/core/schema";
import { loadStoredDiagram, storeDiagram, watchOtherTabs } from "./storage.ts";

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: "failed"; error: unknown }
  | { ok: false; reason: "conflict" }
  /** ページを読み込み直すまで保存できない（serve を止めた・起動し直したなど） */
  | { ok: false; reason: "disconnected" };

export type ReloadResult = { ok: true; diagram: Diagram } | { ok: false; problems: string[] };

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
    reload: async () => {
      const stored = loadStoredDiagram();
      if (stored.status === "ok") return { ok: true, diagram: stored.diagram };
      if (stored.status === "empty")
        return { ok: false, problems: ["保存されていた図が消されました"] };
      if (stored.status === "invalid") return { ok: false, problems: stored.errors };
      return { ok: false, problems: [String(stored.error)] };
    },
  };
};
