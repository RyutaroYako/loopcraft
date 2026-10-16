import { Show, useContext } from "solid-js";
import { EditorContext } from "../editor/editor.ts";
import { Dialog } from "./Dialog.tsx";
import { FileIcon, ImageIcon, LayoutIcon, OpenIcon, SaveIcon } from "./icons.tsx";
import type { DialogKind } from "./Toolbar.tsx";

/** 狭い画面でツールバーに並べないのは、タイトルが読めないほど押し縮められるため */
export function MenuDialog(props: {
  onOpenDialog: (kind: Exclude<DialogKind, "menu">) => void;
  onClose: () => void;
}) {
  const editor = useContext(EditorContext);
  let dialog: HTMLDialogElement | undefined;
  const run = (action: () => void) => {
    dialog?.close();
    action();
  };
  return (
    <Dialog
      title="メニュー"
      class="menu-dialog"
      onClose={props.onClose}
      dialogRef={(element) => (dialog = element)}
      footer={
        <button type="button" class="button primary" onClick={() => props.onOpenDialog("export")}>
          <SaveIcon />
          JSON を書き出す
        </button>
      }
    >
      <Show when={editor.editable()}>
        <button
          type="button"
          class="menu-item"
          onClick={() => run(() => editor.autoLayout())}
          disabled={editor.diagram().variables.length < 2}
        >
          <LayoutIcon />
          整列
          <span class="menu-item-note">元に戻せます</span>
        </button>
        <button type="button" class="menu-item" onClick={() => run(() => editor.newDiagram())}>
          <FileIcon />
          新規
          <span class="menu-item-note">元に戻せます</span>
        </button>
        <button type="button" class="menu-item" onClick={() => props.onOpenDialog("import")}>
          <OpenIcon />
          読み込み
          <span class="menu-item-note">JSON・ファイル</span>
        </button>
      </Show>
      <button
        type="button"
        class="menu-item"
        onClick={() => props.onOpenDialog("screenshot")}
        disabled={editor.diagram().variables.length === 0}
      >
        <ImageIcon />
        画像
        <span class="menu-item-note">PNG でコピー・保存</span>
      </button>
    </Dialog>
  );
}
