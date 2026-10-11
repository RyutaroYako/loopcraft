import type { Diagram } from "@loopcraft/core/schema";
import { storeDiagram, watchOtherTabs } from "./storage.ts";

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: "failed"; error: unknown }
  /** 保存の前提にした内容が、外部で書き換えられていた */
  | { ok: false; reason: "conflict" };

/** 図の保存先。ブラウザの localStorage と、`loopcraft serve` で開いたファイルの 2 種類がある */
export interface DocumentStore {
  readonly kind: "browser" | "file";
  /** 保存先の表示名 */
  readonly label: string;
  /** force なら、外部で書き換えられていても上書きする */
  save(diagram: Diagram, options?: { force?: boolean; keepalive?: boolean }): Promise<SaveResult>;
  /** 別のタブや別のプログラムが保存したときに呼ぶ。戻り値で購読を解除する */
  watch(onChange: () => void): () => void;
  /** 保存先の最新の内容を読み直す。読み直せない保存先や、読めなかったときは undefined */
  reload(): Promise<Diagram | undefined>;
}

export function createBrowserStore(): DocumentStore {
  return {
    kind: "browser",
    label: "ブラウザ",
    save: async (diagram) => {
      const result = storeDiagram(diagram);
      return result.ok ? { ok: true } : { ok: false, reason: "failed", error: result.error };
    },
    watch: watchOtherTabs,
    // 別のタブの内容を黙って取り込むと、このタブの取り消し履歴と食い違うので、再読み込みを促す
    reload: async () => undefined,
  };
}
