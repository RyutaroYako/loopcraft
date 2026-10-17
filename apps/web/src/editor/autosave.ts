import { createContext, createEffect, createSignal, onSettled } from "solid-js";
import type { Accessor } from "solid-js";
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

/** コンポーネント本体から呼ぶ */
export function setupAutosave(
  editor: Editor,
  store: DocumentStore,
  options: {
    initialStatus?: AutosaveStatus;
    onProblem?: (status: AutosaveStatus) => void;
    onReload?: () => void;
    /** 外部での変更を見張れなくなったとき。保存は続ける */
    onUnwatched?: (detail: string | undefined) => void;
    onRecovered?: () => void;
  } = {},
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  let saving: Promise<void> | undefined;
  /** 取り込み（applyExternal）も変更として届くので、それを保存し直さないため */
  let ignoreNextChange = false;
  // 判定に status() を使わないのは、書き込み直後に読むと古い値を返すため
  let current: AutosaveStatus = options.initialStatus ?? { kind: "ok" };
  const [status, setStatus] = createSignal<AutosaveStatus>(current);
  /**
   * 戻ったときに素直に ok にすると、切れる前に止めていた判断（開けなかったファイルや
   * 外部の変更を上書きしない）が消える
   */
  let beforeDisconnect: AutosaveStatus | undefined;
  const disconnect = () => {
    if (current.kind === "suspended" && current.reason === "disconnected") return;
    beforeDisconnect = current;
    update({ kind: "suspended", reason: "disconnected" });
  };
  /** 見張れていれば undefined */
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
      // 重ねて保存しないのは、保存の終わる順が入れ替わらないようにするため
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
      else if (result.reason === "disconnected") disconnect();
      else update({ kind: "failing", error: result.error });
    })();
    await saving;
    saving = undefined;
  };

  const reload = async (): Promise<ReloadResult> => apply(await store.reload());

  const apply = (result: ReloadResult): ReloadResult => {
    if (!result.ok) {
      update({ kind: "suspended", reason: "external", problems: result.problems });
      return result;
    }
    // 同じ内容でも取り込むと、取り消し履歴が増え、やり直しも消える
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
    // 取り込めずに止めた後も追うのは、守る変更が無ければ、直したファイルを取り込めるようにするため
    const following =
      current.kind !== "suspended" || (current.reason !== "disconnected" && !unsaved());
    if (!following) return;
    if (unsaved()) {
      update({ kind: "suspended", reason: "external" });
      return;
    }
    const result = await store.reload();
    // そのまま適用すると、読み直している間の編集を捨ててしまう
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
    // 初回を保存しないのは、開けなかった前回の図を空の図で上書きしないため
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
      // ブラウザへの保存で確かめないのは、その場で終わるため。ファイルへの保存は閉じる間際だと届かないことがある
      if (store.kind === "file") event.preventDefault();
    };
    const stopWatching = store.watch({
      change: () => void onExternalChange(),
      lost: (reason, detail) => {
        if (reason === "disconnected") {
          disconnect();
          return;
        }
        setUnwatched(detail ?? "");
        options.onUnwatched?.(detail);
      },
      restored: () => {
        if (current.kind !== "suspended" || current.reason !== "disconnected") return;
        const previous = beforeDisconnect ?? { kind: "ok" };
        beforeDisconnect = undefined;
        if (previous.kind === "suspended") {
          update(previous);
          return;
        }
        // 確かめずに保存し直してよいのは、つなぎ直せた相手が同じサーバーのため
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
    /** 外部で書き換えられていたら上書きしない */
    retry: () => {
      dirty = true;
      return save();
    },
    /** 外部で書き換えられていても、この画面の内容で上書きする */
    resume: () => {
      dirty = true;
      return save(true);
    },
    /** この画面の変更は捨てる */
    reload,
  };
}

function keyOf(status: AutosaveStatus) {
  return status.kind === "suspended" ? `suspended:${status.reason}` : status.kind;
}

export const AutosaveContext = createContext<{
  status: Accessor<AutosaveStatus>;
  unwatched: Accessor<string | undefined>;
  store: DocumentStore;
  explain: (status: AutosaveStatus) => void;
  explainUnwatched: (detail: string | undefined) => void;
}>();
