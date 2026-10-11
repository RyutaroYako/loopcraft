import { For, Show, useContext } from "solid-js";
import { EditorContext } from "../editor/editor.ts";
import { CloseIcon } from "./icons.tsx";

export function NoticeView() {
  const editor = useContext(EditorContext);
  return (
    <Show when={editor.notice()} keyed>
      {(notice) => (
        <div class={["notice", notice.tone]} role={notice.tone === "error" ? "alert" : "status"}>
          <div class="notice-body">
            <p class="notice-title">{notice.title}</p>
            <Show when={notice.details?.length}>
              <ul class="notice-details">
                <For each={notice.details?.slice(0, 8)}>{(detail) => <li>{detail}</li>}</For>
              </ul>
              <Show when={(notice.details?.length ?? 0) > 8}>
                <p class="notice-more">ほか {(notice.details?.length ?? 0) - 8} 件</p>
              </Show>
            </Show>
          </div>
          <button
            type="button"
            class="icon-button"
            onClick={() => editor.setNotice(null)}
            aria-label="閉じる"
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </Show>
  );
}
