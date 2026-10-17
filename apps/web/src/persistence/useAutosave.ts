import type { Ref } from "vue";
import { ref, watch } from "vue";
import type { Editor } from "../editor/useEditor.ts";
import { createAutosaver } from "./autosave.ts";
import type { AutosaveOptions, AutosaveStatus } from "./autosave.ts";
import type { DocumentStore } from "./store.ts";

export type Autosave = ReturnType<typeof useAutosave>;

/** 見張りや閉じる間際の保存をここで始めないのは、window に触るため。マウントした後に start() を呼ぶ */
export function useAutosave(
  editor: Editor,
  store: DocumentStore,
  options: Omit<AutosaveOptions, "onStatus"> = {},
) {
  const status = ref<AutosaveStatus>(options.initialStatus ?? { kind: "ok" });
  /** 見張れていれば undefined */
  const unwatched = ref<string | undefined>(undefined);
  const autosaver = createAutosaver(
    { current: () => editor.diagram.value, applyExternal: editor.applyExternal },
    store,
    {
      ...options,
      onStatus: (next) => (status.value = next),
      onUnwatched: (detail) => {
        unwatched.value = detail ?? "";
        options.onUnwatched?.(detail);
      },
    },
  );

  // sync にするのは、取り込み（applyExternal）による変化だけを見分けて保存し直さないため。
  // 既定の pre だと、同じ tick の編集とまとめて届き、見分けられない
  watch(editor.diagram, () => autosaver.changed(), { flush: "sync" });

  return {
    store,
    status: status as Readonly<Ref<AutosaveStatus>>,
    unwatched: unwatched as Readonly<Ref<string | undefined>>,
    start: autosaver.start,
    retry: autosaver.retry,
    resume: autosaver.resume,
    reload: autosaver.reload,
  };
}
