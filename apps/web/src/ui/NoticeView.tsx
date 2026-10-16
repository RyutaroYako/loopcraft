import { For, Show, useContext } from "solid-js";
import { EditorContext } from "../editor/editor.ts";
import { DetailList } from "./DetailList.tsx";
import { CloseIcon } from "./icons.tsx";

export function NoticeView() {
  const editor = useContext(EditorContext);
  return (
    <Show when={editor.notice()} keyed>
      {(notice) => (
        // -translate-x-1/2 にしないのは、translate プロパティが登場アニメーションの transform と重なり、二重にずれるため
        <div
          class={[
            "fixed top-17 left-1/2 z-20 w-[min(480px,calc(100vw-32px))] transform-[translateX(-50%)] animate-notice-in",
            "flex items-start gap-3 rounded-lg border bg-surface pt-3 pr-2 pb-3 pl-4 shadow-float",
            notice.tone === "error" ? "border-negative-line" : "border-line",
          ]}
          role={notice.tone === "error" ? "alert" : "status"}
          aria-label="お知らせ"
        >
          <div class="grid min-w-0 flex-1 gap-1.5 pt-1">
            <p class={["font-semibold", { "text-negative": notice.tone === "error" }]}>
              {notice.title}
            </p>
            <Show when={notice.details?.length ? notice.details : undefined} keyed>
              {(details) => <DetailList items={details} />}
            </Show>
            <Show when={notice.actions?.length}>
              <div class="flex flex-wrap gap-1.5 pt-1">
                <For each={notice.actions}>
                  {(action) => (
                    <button type="button" class="button small" onClick={() => action.run()}>
                      {action.label}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
          <button
            type="button"
            class="icon-button"
            onClick={() => editor.dismissNotice()}
            aria-label="閉じる"
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </Show>
  );
}
