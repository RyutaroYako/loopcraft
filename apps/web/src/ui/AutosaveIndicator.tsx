import { Show, useContext } from "solid-js";
import { AutosaveContext, type AutosaveStatus } from "../editor/autosave.ts";
import type { DocumentStore } from "../editor/store.ts";

const statusClass =
  "inline-flex h-7 items-center gap-1.75 rounded-pill border px-2.5 py-0 text-sm whitespace-nowrap";
const dotClass = "size-1.75 rounded-[50%]";

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
  const warning = () => status().kind === "ok";
  const explain = () => {
    if (status().kind !== "ok") autosave.explain(status());
    else autosave.explainUnwatched(autosave.unwatched());
  };
  return (
    <Show
      when={status().kind !== "ok" || unwatched()}
      fallback={
        <span
          class={[statusClass, "border-transparent bg-transparent text-muted"]}
          title={
            autosave.store.kind === "file"
              ? `変更は ${autosave.store.label} に自動で保存されます`
              : "変更はこのブラウザに自動で保存されます"
          }
        >
          <span class={[dotClass, "bg-accent opacity-70"]} aria-hidden="true" />
          <span class="max-md:hidden">{label()}</span>
        </span>
      }
    >
      <button
        type="button"
        class={[
          statusClass,
          "font-medium transition-[transform] active:transform-[translateY(1px)_scale(0.98)]",
          warning()
            ? "border-warning-line bg-warning-soft text-warning"
            : "border-[rgb(190_52_85/0.3)] bg-negative-soft text-negative",
        ]}
        aria-label={`${label()}。詳しく見る`}
        onClick={explain}
      >
        <span
          class={[
            dotClass,
            "animate-save-pulse opacity-100",
            warning() ? "bg-warning-dot" : "bg-negative",
          ]}
          aria-hidden="true"
        />
        <span>{label()}</span>
      </button>
    </Show>
  );
}
