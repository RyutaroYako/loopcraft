import type { Diagram } from "@loopcraft/core/schema";
import { storeDiagram, watchOtherTabs } from "./storage.ts";

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: "failed"; error: unknown }
  /** 保存の前提にした内容が、外部で書き換えられていた */
  | { ok: false; reason: "conflict" }
  /** loopcraft serve との接続が切れた（止めた・起動し直したなど）。ページを読み込み直すまで保存できない */
  | { ok: false; reason: "disconnected" };

export type ReloadResult =
  | { ok: true; diagram: Diagram }
  /** problems は読み直せなかった理由。読み直せない保存先では空 */
  | { ok: false; problems: string[] };

export interface WatchHandlers {
  /** 別のタブや別のプログラムが保存した */
  change(): void;
  /**
   * disconnected: 保存先とのつながりが切れた
   * unwatched: 外部での変更を見張れなくなった（保存はできる）
   */
  lost(reason: "disconnected" | "unwatched", detail?: string): void;
  /** 切れていたつながりが戻った */
  restored(): void;
}

/** 図の保存先。ブラウザの localStorage と、`loopcraft serve` で開いたファイルの 2 種類がある */
export interface DocumentStore {
  readonly kind: "browser" | "file";
  /** 保存先の表示名 */
  readonly label: string;
  /** force なら、外部で書き換えられていても上書きする */
  save(diagram: Diagram, options?: { force?: boolean; keepalive?: boolean }): Promise<SaveResult>;
  /** 戻り値で購読を解除する */
  watch(handlers: WatchHandlers): () => void;
  /** 保存先の最新の内容を読み直す */
  reload(): Promise<ReloadResult>;
}

export function createBrowserStore(): DocumentStore {
  return {
    kind: "browser",
    label: "ブラウザ",
    save: async (diagram) => {
      const result = storeDiagram(diagram);
      return result.ok ? { ok: true } : { ok: false, reason: "failed", error: result.error };
    },
    watch: (handlers) => watchOtherTabs(() => handlers.change()),
    // 別のタブの内容を黙って取り込むと、このタブの取り消し履歴と食い違うので、再読み込みを促す
    reload: async () => ({ ok: false, problems: [] }),
  };
}
