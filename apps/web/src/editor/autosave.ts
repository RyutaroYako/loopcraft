import { createContext, createEffect, createSignal, onSettled, type Accessor } from "solid-js";
import type { Editor } from "./editor.ts";
import { stringifyDiagram } from "@loopcraft/core/io";
import type { DocumentStore, ReloadResult } from "./store.ts";

const SAVE_DELAY_MS = 300;

export type AutosaveStatus =
  | { kind: "ok" }
  | { kind: "failing"; error: unknown }
  /**
   * external: 別のタブや別のプログラムが保存先を書き換えたので、上書きしないよう止めている。
   *   problems は取り込もうとして取り込めなかった理由
   * unreadable: 開けなかった図を残すため、上書きしないよう止めている
   * disconnected: loopcraft serve とのつながりが切れたので、保存できない
   */
  | { kind: "suspended"; reason: "external"; problems?: string[] }
  | { kind: "suspended"; reason: "unreadable" | "disconnected" };

/**
 * 図の変更を保存先へ自動保存する。コンポーネント本体から呼ぶ。
 * - 開いただけでは保存しない（開けなかった前回の図を空の図で上書きしないため）
 * - 保存先が外部で書き換えられたら、未保存の変更が無ければ取り込み、あれば保存を止める
 * - タブを隠すときは待たずに保存し、未保存の変更があるまま閉じようとしたら確かめる
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
    /** 外部での変更を見張れなくなったとき。保存は続ける */
    onUnwatched?: (detail: string | undefined) => void;
    /** 問題のある状態から戻ったとき */
    onRecovered?: () => void;
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
  /** 外部での変更を見張れなくなった理由。見張れていれば undefined */
  const [unwatched, setUnwatched] = createSignal<string | undefined>(undefined);

  const update = (next: AutosaveStatus) => {
    const worsened = next.kind !== "ok" && keyOf(current) !== keyOf(next);
    const recovered = next.kind === "ok" && current.kind !== "ok";
    current = next;
    setStatus(next);
    if (worsened) options.onProblem?.(next);
    if (recovered) options.onRecovered?.();
  };

  const unsaved = () => dirty || saving !== undefined || timer !== undefined;

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
        return;
      }
      dirty = true;
      if (result.reason === "conflict") update({ kind: "suspended", reason: "external" });
      else if (result.reason === "disconnected")
        update({ kind: "suspended", reason: "disconnected" });
      else update({ kind: "failing", error: result.error });
    })();
    await saving;
    saving = undefined;
  };

  /** 保存先の最新の内容を、取り消し履歴に残る 1 回の変更として取り込む */
  const reload = async (): Promise<ReloadResult> => apply(await store.reload());

  const apply = (result: ReloadResult): ReloadResult => {
    if (!result.ok) {
      update({ kind: "suspended", reason: "external", problems: result.problems });
      return result;
    }
    // 同じ内容なら取り込まない。取り消し履歴を増やしたり、やり直しを消したりしないため
    if (stringifyDiagram(result.diagram) === stringifyDiagram(editor.current())) {
      dirty = false;
      update({ kind: "ok" });
      return result;
    }
    ignoreNextChange = true;
    editor.applyExternal(result.diagram);
    dirty = false;
    update({ kind: "ok" });
    options.onReload?.();
    return result;
  };

  const onExternalChange = async () => {
    // 取り込めずに止めていても、この画面に守る変更が無ければ追い続ける（直したファイルを取り込む）
    const following =
      current.kind !== "suspended" || (current.reason !== "disconnected" && !unsaved());
    if (!following) return;
    if (unsaved()) {
      update({ kind: "suspended", reason: "external" });
      return;
    }
    const result = await store.reload();
    // 読み直している間に編集されていたら、その編集を捨てずに競合として知らせる
    if (unsaved()) {
      update({ kind: "suspended", reason: "external" });
      return;
    }
    apply(result);
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
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!unsaved()) return;
      flush();
      // ブラウザへの保存はその場で終わるが、ファイルへの保存は閉じる間際だと届かないことがあるので確かめる
      if (store.kind === "file") event.preventDefault();
    };
    const stopWatching = store.watch({
      change: () => void onExternalChange(),
      lost: (reason, detail) => {
        if (reason === "disconnected") {
          update({ kind: "suspended", reason: "disconnected" });
          return;
        }
        setUnwatched(detail ?? "");
        options.onUnwatched?.(detail);
      },
      restored: () => {
        // 同じサーバーにつなぎ直せたので、溜まっていた変更を保存し直す
        if (current.kind !== "suspended" || current.reason !== "disconnected") return;
        update({ kind: "ok" });
        if (dirty) void save();
      },
    });
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      flush();
      stopWatching();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });

  return {
    status,
    unwatched,
    /** 失敗した保存をやり直す。外部で書き換えられていたら、上書きせずに知らせる */
    retry: () => {
      dirty = true;
      return save();
    },
    /** 止めていた自動保存を再開し、この画面の内容で上書きする */
    resume: () => {
      dirty = true;
      return save(true);
    },
    /** 保存先の内容を読み直して、この画面の変更を捨てる */
    reload,
  };
}

function keyOf(status: AutosaveStatus) {
  return status.kind === "suspended" ? `suspended:${status.reason}` : status.kind;
}

/** ツールバーに自動保存の状態を出し、押すと詳しい案内と操作を表示する */
export const AutosaveContext = createContext<{
  status: Accessor<AutosaveStatus>;
  unwatched: Accessor<string | undefined>;
  store: DocumentStore;
  explain: (status: AutosaveStatus) => void;
  explainUnwatched: (detail: string | undefined) => void;
}>();
