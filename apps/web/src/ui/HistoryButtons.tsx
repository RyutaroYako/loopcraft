import { useContext } from "solid-js";
import { EditorContext } from "../editor/editor.ts";
import { RedoIcon, UndoIcon } from "./icons.tsx";
import { mod } from "./shortcut.ts";

export function HistoryButtons(props: { class: string; buttonClass?: string }) {
  const editor = useContext(EditorContext);
  return (
    <div class={props.class} role="group" aria-label="履歴">
      <button
        type="button"
        class={["icon-button", props.buttonClass]}
        onClick={() => editor.undo()}
        disabled={!editor.editable() || editor.historySize().undo === 0}
        title={`元に戻す (${mod}Z)`}
        aria-label="元に戻す"
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        class={["icon-button", props.buttonClass]}
        onClick={() => editor.redo()}
        disabled={!editor.editable() || editor.historySize().redo === 0}
        title={`やり直す (${mod}Shift+Z)`}
        aria-label="やり直す"
      >
        <RedoIcon />
      </button>
    </div>
  );
}
