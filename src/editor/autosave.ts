import { createContext, createEffect, createSignal, onSettled, type Accessor } from "solid-js";
import type { Editor } from "./editor.ts";
import { storeDiagram, watchOtherTabs } from "./storage.ts";

const SAVE_DELAY_MS = 300;

export type AutosaveStatus =
  | { kind: "ok" }
  | { kind: "failing"; error: unknown }
  /**
   * other-tab: 別のタブが同じ図を保存したので、上書きしないよう止めている
   * unreadable: 読み込めなかった前回の図を退避できなかったので、上書きしないよう止めている
   */
  | { kind: "suspended"; reason: "other-tab" | "unreadable" };

/**
 * 図の変更を localStorage へ自動保存する。コンポーネント本体から呼ぶ。
 * - 開いただけでは保存しない（読み込めなかった前回の図を空の図で上書きしないため）
 * - 別のタブが保存したら、このタブからの保存を止めて上書きを防ぐ
 * - タブを閉じる・隠すときは待たずに保存する
 * - initialStatus で、使えない・止めている状態から始められる
 * 状態は status で常に読めるようにし、悪くなったときだけ onProblem で知らせる。
 */
export function setupAutosave(
  editor: Editor,
  options: { initialStatus?: AutosaveStatus; onProblem?: (status: AutosaveStatus) => void } = {},
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  // シグナルは書き込み直後に読んでも古い値を返すので、判定用に最新の状態を別に持つ
  let current: AutosaveStatus = options.initialStatus ?? { kind: "ok" };
  const [status, setStatus] = createSignal<AutosaveStatus>(current);

  const update = (next: AutosaveStatus) => {
    const worsened = next.kind !== "ok" && current.kind !== next.kind;
    current = next;
    setStatus(next);
    if (worsened) options.onProblem?.(next);
  };

  const save = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!dirty || current.kind === "suspended") return;
    const result = storeDiagram(editor.current());
    if (result.ok) {
      dirty = false;
      update({ kind: "ok" });
    } else {
      update({ kind: "failing", error: result.error });
    }
  };

  /** 止めていた自動保存を再開し、溜まっていた変更をすぐに保存する */
  const resume = () => {
    if (current.kind === "suspended") update({ kind: "ok" });
    dirty = true;
    save();
  };

  createEffect(
    () => editor.diagram(),
    () => {
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(save, SAVE_DELAY_MS);
    },
    { defer: true },
  );

  onSettled(() => {
    const flush = () => {
      if (timer !== undefined) save();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const stopWatching = watchOtherTabs(() => {
      if (current.kind !== "suspended") update({ kind: "suspended", reason: "other-tab" });
    });
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      flush();
      stopWatching();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });

  return { status, resume };
}

/** ツールバーに自動保存の状態を出し、押すと詳しい案内と操作を表示する */
export const AutosaveContext = createContext<{
  status: Accessor<AutosaveStatus>;
  explain: (status: AutosaveStatus) => void;
}>();
