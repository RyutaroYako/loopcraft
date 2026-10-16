import { Show, useContext } from "solid-js";
import { EditorContext } from "../editor/editor.ts";
import { Dialog } from "./Dialog.tsx";
import { FileIcon, ImageIcon, LayoutIcon, OpenIcon, SaveIcon } from "./icons.tsx";
import type { DialogKind } from "./Toolbar.tsx";

const menuItemClass =
  "flex min-h-13 items-center gap-3.5 rounded-md border-0 bg-transparent px-3 py-0 text-left text-lg enabled:hover:bg-surface-2 disabled:cursor-default disabled:opacity-40";
const noteClass = "ml-auto text-[12.5px] text-muted";

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
      width="w-[min(420px,calc(100vw-32px))]"
      bodyClass="gap-0 px-2 pt-1 pb-2"
      // 画面の中央に出さないのは、狭い画面では上の方の項目に親指が届かないため
      class="max-md:mx-0 max-md:mt-auto max-md:mb-0 max-md:w-full max-md:max-w-none max-md:rounded-[18px_18px_0_0] max-md:pb-[env(safe-area-inset-bottom)]"
      onClose={props.onClose}
      dialogRef={(element) => (dialog = element)}
      footer={
        <button
          type="button"
          class="button primary h-12 flex-1 text-lg"
          onClick={() => props.onOpenDialog("export")}
        >
          <SaveIcon />
          JSON を書き出す
        </button>
      }
    >
      <Show when={editor.editable()}>
        <button
          type="button"
          class={menuItemClass}
          onClick={() => run(() => editor.autoLayout())}
          disabled={editor.diagram().variables.length < 2}
        >
          <LayoutIcon />
          整列
          <span class={noteClass}>元に戻せます</span>
        </button>
        <button type="button" class={menuItemClass} onClick={() => run(() => editor.newDiagram())}>
          <FileIcon />
          新規
          <span class={noteClass}>元に戻せます</span>
        </button>
        <button type="button" class={menuItemClass} onClick={() => props.onOpenDialog("import")}>
          <OpenIcon />
          読み込み
          <span class={noteClass}>JSON・ファイル</span>
        </button>
      </Show>
      <button
        type="button"
        class={menuItemClass}
        onClick={() => props.onOpenDialog("screenshot")}
        disabled={editor.diagram().variables.length === 0}
      >
        <ImageIcon />
        画像
        <span class={noteClass}>PNG でコピー・保存</span>
      </button>
    </Dialog>
  );
}
