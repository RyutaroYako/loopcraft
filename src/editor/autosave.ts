import { createEffect, onSettled } from "solid-js";
import type { Editor } from "./editor.ts";
import { storeDiagram, watchOtherTabs } from "./storage.ts";

const SAVE_DELAY_MS = 300;

/**
 * 図の変更を localStorage へ自動保存する。コンポーネント本体から呼ぶ。
 * - 開いただけでは保存しない（読み込めなかった前回の図を空の図で上書きしないため）
 * - 保存に失敗したら一度だけ知らせ、成功したら再び知らせられるよう戻す
 * - 別のタブが保存したら、このタブからの保存を止めて上書きを防ぐ
 * - タブを閉じる・隠すときは待たずに保存する
 */
export function setupAutosave(editor: Editor) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  let failing = false;
  let suspended = false;

  const save = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!dirty || suspended) return;
    const result = storeDiagram(editor.current());
    if (result.ok) {
      dirty = false;
      failing = false;
      return;
    }
    if (failing) return;
    failing = true;
    editor.notify({
      tone: "error",
      title: "ブラウザに自動保存できません",
      details: ["「JSON を書き出す」でファイルに保存してください", String(result.error)],
    });
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
      if (suspended) return;
      suspended = true;
      editor.notify({
        tone: "error",
        title: "別のタブでこの図が保存されました",
        details: [
          "上書きを防ぐため、このタブの自動保存を止めています",
          "別のタブの内容を使うときは、このタブを再読み込みしてください",
        ],
        action: {
          label: "このタブの内容で保存し直す",
          run: () => {
            editor.setNotice(null);
            suspended = false;
            dirty = true;
            save();
          },
        },
      });
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
}
