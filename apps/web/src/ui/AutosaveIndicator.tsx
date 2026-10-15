import { Show, useContext } from "solid-js";
import { AutosaveContext, type AutosaveStatus } from "../editor/autosave.ts";
import type { DocumentStore } from "../editor/store.ts";

function labelOf(status: AutosaveStatus, store: DocumentStore, unwatched: boolean) {
  if (status.kind === "failing") return "自動保存できません";
  if (status.kind === "suspended") {
    return status.reason === "disconnected" ? "接続が切れました" : "自動保存を停止中";
  }
  if (unwatched) return "変更を見張れません";
  return store.kind === "file" ? store.label : "自動保存済み";
}

export function AutosaveIndicator() {
  const autosave = useContext(AutosaveContext);
  const status = () => autosave.status();
  const unwatched = () => autosave.unwatched() !== undefined;
  const label = () => labelOf(status(), autosave.store, unwatched());
  const explain = () => {
    if (status().kind !== "ok") autosave.explain(status());
    else autosave.explainUnwatched(autosave.unwatched());
  };
  return (
    <Show
      when={status().kind !== "ok" || unwatched()}
      fallback={
        <span
          class="save-status ok"
          title={
            autosave.store.kind === "file"
              ? `変更は ${autosave.store.label} に自動で保存されます`
              : "変更はこのブラウザに自動で保存されます"
          }
        >
          <span class="save-dot" aria-hidden="true" />
          <span class="save-label">{label()}</span>
        </span>
      }
    >
      <button
        type="button"
        class={["save-status", status().kind === "ok" ? "warning" : status().kind]}
        aria-label={`${label()}。詳しく見る`}
        onClick={explain}
      >
        <span class="save-dot" aria-hidden="true" />
        <span class="save-label">{label()}</span>
      </button>
    </Show>
  );
}
