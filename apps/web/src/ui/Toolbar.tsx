import { useContext } from "solid-js";
import { EditorContext } from "../editor/editor.ts";
import { AutosaveIndicator } from "./AutosaveIndicator.tsx";
import { pickJsonFile } from "../editor/file.ts";
import * as edit from "@loopcraft/core/edit";
import { FileIcon, LogoMark, OpenIcon, RedoIcon, SaveIcon, UndoIcon } from "./icons.tsx";

const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
const mod = isMac ? "⌘" : "Ctrl+";

export function Toolbar() {
  const editor = useContext(EditorContext);
  const setTitle = (title: string) =>
    editor.commit(edit.setTitle(editor.current(), title), "title");
  const open = async () => {
    const file = await pickJsonFile();
    if (file) await editor.importFile(file);
  };
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
          placeholder="無題のシステム図"
          onInput={(event) => {
            if (!event.isComposing) setTitle(event.currentTarget.value);
          }}
          onCompositionEnd={(event) => setTitle(event.currentTarget.value)}
        />
      </label>
      <AutosaveIndicator />
      <div class="toolbar-group" role="group" aria-label="履歴">
        <button
          type="button"
          class="icon-button"
          onClick={() => editor.undo()}
          disabled={editor.historySize().undo === 0}
          title={`元に戻す (${mod}Z)`}
          aria-label="元に戻す"
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          class="icon-button"
          onClick={() => editor.redo()}
          disabled={editor.historySize().redo === 0}
          title={`やり直す (${mod}Shift+Z)`}
          aria-label="やり直す"
        >
          <RedoIcon />
        </button>
      </div>
      <div class="toolbar-group toolbar-file" role="group" aria-label="ファイル">
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
          onClick={open}
          aria-label="読み込み"
          title="JSON ファイルを読み込む"
        >
          <OpenIcon />
          <span class="button-label">読み込み</span>
        </button>
        <button
          type="button"
          class="button primary"
          onClick={() => editor.exportFile()}
          aria-label="JSON を書き出す"
          title={`JSON ファイルとして保存 (${mod}S)`}
        >
          <SaveIcon />
          <span class="button-label">JSON を書き出す</span>
        </button>
      </div>
    </header>
  );
}
