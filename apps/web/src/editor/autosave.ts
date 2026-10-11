import { createContext, createEffect, createSignal, onSettled, type Accessor } from "solid-js";
import type { Editor } from "./editor.ts";
import type { DocumentStore } from "./store.ts";

const SAVE_DELAY_MS = 300;

export type AutosaveStatus =
  | { kind: "ok" }
  | { kind: "failing"; error: unknown }
  /**
   * external: 別のタブや別のプログラムが保存先を書き換えたので、上書きしないよう止めている
   * unreadable: 開けなかった前回の図を残すため、上書きしないよう止めている
   */
  | { kind: "suspended"; reason: "external" | "unreadable" };

/**
 * 図の変更を保存先へ自動保存する。コンポーネント本体から呼ぶ。
 * - 開いただけでは保存しない（開けなかった前回の図を空の図で上書きしないため）
 * - 保存先が外部で書き換えられたら、未保存の変更が無ければ取り込み、あれば保存を止める
 * - タブを閉じる・隠すときは待たずに保存する
 * - initialStatus で、使えない・止めている状態から始められる
 * 状態は status で常に読めるようにし、悪くなったときだけ onProblem で知らせる。
 */
export function setupAutosave(
  editor: Editor,
  store: DocumentStore,
  options: {
    initialStatus?: AutosaveStatus;
    onProblem?: (status: AutosaveStatus) => void;
    /** 外部での変更を取り込んだとき */
    onReload?: () => void;
  } = {},
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  let saving: Promise<void> | undefined;
  /** 取り込んだ内容をそのまま保存し直さないよう、次の 1 回の変更を無視する */
  let ignoreNextChange = false;
  // シグナルは書き込み直後に読んでも古い値を返すので、判定用に最新の状態を別に持つ
  let current: AutosaveStatus = options.initialStatus ?? { kind: "ok" };
  const [status, setStatus] = createSignal<AutosaveStatus>(current);

  const update = (next: AutosaveStatus) => {
    const worsened = next.kind !== "ok" && current.kind !== next.kind;
    current = next;
    setStatus(next);
    if (worsened) options.onProblem?.(next);
  };

  const save = async (force = false, keepalive = false): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    if (saving) {
      // 保存中の変更は、その保存が終わってから改めて保存する
      await saving;
      return save(force, keepalive);
    }
    if (!dirty || (current.kind === "suspended" && !force)) return;
    dirty = false;
    saving = (async () => {
      const result = await store.save(editor.current(), { force, keepalive });
      if (result.ok) {
        update({ kind: "ok" });
      } else {
        dirty = true;
        update(
          result.reason === "conflict"
            ? { kind: "suspended", reason: "external" }
            : { kind: "failing", error: result.error },
        );
      }
    })();
    await saving;
    saving = undefined;
  };

  /** 保存先の最新の内容を、取り消し履歴に残る 1 回の変更として取り込む */
  const reload = async () => {
    const latest = await store.reload();
    if (!latest) return false;
    ignoreNextChange = true;
    editor.applyExternal(latest);
    dirty = false;
    update({ kind: "ok" });
    options.onReload?.();
    return true;
  };

  const onExternalChange = async () => {
    if (current.kind === "suspended") return;
    const unsaved = dirty || saving !== undefined || timer !== undefined;
    if (!unsaved && (await reload())) return;
    update({ kind: "suspended", reason: "external" });
  };

  createEffect(
    () => editor.diagram(),
    () => {
      if (ignoreNextChange) {
        ignoreNextChange = false;
        return;
      }
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(() => void save(), SAVE_DELAY_MS);
    },
    { defer: true },
  );

  onSettled(() => {
    const flush = () => {
      if (timer !== undefined) void save(false, true);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const stopWatching = store.watch(() => void onExternalChange());
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      flush();
      stopWatching();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });

  return {
    status,
    /** 止めていた自動保存を再開し、この画面の内容で保存し直す */
    resume: () => {
      dirty = true;
      return save(true);
    },
    /** 保存先の内容を読み直して、この画面の変更を捨てる。読めなかったら false */
    reload,
  };
}

/** ツールバーに自動保存の状態を出し、押すと詳しい案内と操作を表示する */
export const AutosaveContext = createContext<{
  status: Accessor<AutosaveStatus>;
  store: DocumentStore;
  explain: (status: AutosaveStatus) => void;
}>();
