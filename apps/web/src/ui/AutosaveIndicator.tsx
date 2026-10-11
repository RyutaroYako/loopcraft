import { Show, useContext } from "solid-js";
import { AutosaveContext, type AutosaveStatus } from "../editor/autosave.ts";

function labelOf(status: AutosaveStatus) {
  if (status.kind === "failing") return "自動保存できません";
  if (status.kind === "suspended") return "自動保存を停止中";
  return "自動保存済み";
}

/** 自動保存の状態を常に見えるようにする。問題があるときは押すと対処の案内を出す */
export function AutosaveIndicator() {
  const autosave = useContext(AutosaveContext);
  const status = () => autosave.status();
  return (
    <Show
      when={status().kind !== "ok"}
      fallback={
        <span class="save-status ok" title="変更はこのブラウザに自動で保存されます">
          <span class="save-dot" aria-hidden="true" />
          <span class="save-label">{labelOf(status())}</span>
        </span>
      }
    >
      <button
        type="button"
        class={["save-status", status().kind]}
        aria-label={`${labelOf(status())}。詳しく見る`}
        onClick={() => autosave.explain(status())}
      >
        <span class="save-dot" aria-hidden="true" />
        <span class="save-label">{labelOf(status())}</span>
      </button>
    </Show>
  );
}
