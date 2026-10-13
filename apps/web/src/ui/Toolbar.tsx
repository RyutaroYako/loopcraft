import { Show, useContext } from "solid-js";
import { AutosaveContext } from "../editor/autosave.ts";
import { EditorContext } from "../editor/editor.ts";
import { AutosaveIndicator } from "./AutosaveIndicator.tsx";
import * as edit from "@loopcraft/core/edit";
import { FileIcon, ImageIcon, LogoMark, OpenIcon, RedoIcon, SaveIcon, UndoIcon } from "./icons.tsx";

const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
const mod = isMac ? "⌘" : "Ctrl+";

export type DialogKind = "import" | "export" | "screenshot";

export function Toolbar(props: { readonly: boolean; onOpenDialog: (kind: DialogKind) => void }) {
  const editor = useContext(EditorContext);
  const autosave = useContext(AutosaveContext);
  const setTitle = (title: string) =>
    editor.commit(edit.setTitle(editor.current(), title), "title");
  return (
    <header class="toolbar">
      <div class="brand">
        <LogoMark />
        <span class="brand-name">Loopcraft</span>
      </div>
      <label class="title-field">
        <span class="visually-hidden">図のタイトル</span>
        <input
          name="title"
          value={editor.diagram().title}
          readonly={!editor.editable()}
          placeholder="無題のシステム図"
          onInput={(event) => {
            if (!event.isComposing) setTitle(event.currentTarget.value);
          }}
          onCompositionEnd={(event) => setTitle(event.currentTarget.value)}
        />
      </label>
      <Show when={autosave.store.kind === "file"}>
        <ModeSwitch readonly={props.readonly} />
      </Show>
      <AutosaveIndicator />
      <div class="toolbar-group" role="group" aria-label="履歴">
        <button
          type="button"
          class="icon-button"
          onClick={() => editor.undo()}
          disabled={!editor.editable() || editor.historySize().undo === 0}
          title={`元に戻す (${mod}Z)`}
          aria-label="元に戻す"
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          class="icon-button"
          onClick={() => editor.redo()}
          disabled={!editor.editable() || editor.historySize().redo === 0}
          title={`やり直す (${mod}Shift+Z)`}
          aria-label="やり直す"
        >
          <RedoIcon />
        </button>
      </div>
      <div class="toolbar-group toolbar-file" role="group" aria-label="ファイル">
        <Show when={editor.editable()}>
          <button
            type="button"
            class="button ghost"
            onClick={() => editor.newDiagram()}
            aria-label="新規"
            title="新しい図を作る（元に戻せます）"
          >
            <FileIcon />
            <span class="button-label">新規</span>
          </button>
          <button
            type="button"
            class="button ghost"
            onClick={() => props.onOpenDialog("import")}
            aria-label="読み込み"
            title="JSON を貼り付けるか、ファイルから読み込む"
          >
            <OpenIcon />
            <span class="button-label">読み込み</span>
          </button>
        </Show>
        <button
          type="button"
          class="button ghost"
          onClick={() => props.onOpenDialog("screenshot")}
          disabled={editor.diagram().variables.length === 0}
          aria-label="画像"
          title="図全体を画像にしてコピー・保存する"
        >
          <ImageIcon />
          <span class="button-label">画像</span>
        </button>
        <button
          type="button"
          class="button primary"
          onClick={() => props.onOpenDialog("export")}
          aria-label="JSON を書き出す"
          title={`JSON をコピーするか、ファイルに保存する（${mod}S でファイルに保存）`}
        >
          <SaveIcon />
          <span class="button-label">JSON を書き出す</span>
        </button>
      </div>
    </header>
  );
}

/** serve で開いたときの、閲覧モードと編集モードの切り替え */
function ModeSwitch(props: { readonly: boolean }) {
  const editor = useContext(EditorContext);
  return (
    <Show
      when={!props.readonly}
      fallback={
        <span class="mode-badge" title="loopcraft serve --readonly で開いています">
          読み取り専用
        </span>
      }
    >
      <div class="mode-switch" role="radiogroup" aria-label="モード">
        <button
          type="button"
          role="radio"
          aria-checked={editor.editable() ? "false" : "true"}
          class={{ active: !editor.editable() }}
          onClick={() => editor.setEditable(false)}
        >
          閲覧
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={editor.editable() ? "true" : "false"}
          class={{ active: editor.editable() }}
          onClick={() => editor.setEditable(true)}
        >
          編集
        </button>
      </div>
    </Show>
  );
}
