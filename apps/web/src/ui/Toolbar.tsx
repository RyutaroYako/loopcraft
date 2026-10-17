import { Show, useContext } from "solid-js";
import { EditorContext } from "../editor/editor.ts";
import { AutosaveIndicator } from "./AutosaveIndicator.tsx";
import { HistoryButtons } from "./HistoryButtons.tsx";
import { mod } from "./shortcut.ts";
import * as edit from "@loopcraft/core/edit";
import {
  FileIcon,
  ImageIcon,
  LockIcon,
  LayoutIcon,
  LogoMark,
  MoreIcon,
  OpenIcon,
  SaveIcon,
  Wordmark,
} from "./icons.tsx";

export type DialogKind = "import" | "export" | "screenshot" | "menu";

export function Toolbar(props: { readonly: boolean; onOpenDialog: (kind: DialogKind) => void }) {
  const editor = useContext(EditorContext);
  const setTitle = (title: string) =>
    editor.commit(edit.setTitle(editor.current(), title), "title");
  return (
    <header class="grid grid-flow-col auto-cols-auto grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-line bg-surface pr-3 pl-4 max-md:gap-1 max-md:pr-2 max-md:pl-3">
      <h1 class="flex items-center gap-2 border-r border-line pr-3 text-ink max-md:pr-2">
        <LogoMark />
        <Wordmark class="h-4 w-16.75 max-md:hidden" />
        {/* ワードマークの svg に名前を付けないのは、狭い画面で隠すと見出しの名前まで消えるため */}
        <span class="sr-only">Loopcraft</span>
      </h1>
      <label class="min-w-0">
        <span class="sr-only">図のタイトル</span>
        <input
          class="h-8.5 w-[min(100%,440px)] rounded-sm border border-transparent px-2.5 text-lg font-medium tracking-heading transition-[background-color,border-color] hover:bg-surface-2 focus:border-accent focus:bg-surface focus:outline-none"
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
      <Show when={props.readonly}>
        <span
          class="rounded-full bg-surface-2 px-2.5 py-0.75 text-sm font-medium whitespace-nowrap text-ink-2 max-md:inline-flex max-md:px-1.5 max-md:py-1"
          title="loopcraft serve --readonly で開いています"
        >
          {/* 見えている文言を読ませないのは、狭い画面で印だけに縮めると読み上げまで変わるため */}
          <span class="max-md:hidden" aria-hidden="true">
            読み取り専用
          </span>
          <span class="hidden max-md:inline-flex" aria-hidden="true">
            <LockIcon />
          </span>
          <span class="sr-only">読み取り専用。編集も保存もできません</span>
        </span>
      </Show>
      <AutosaveIndicator />
      <HistoryButtons class="flex items-center gap-0.5 max-md:hidden" />
      <Show when={editor.editable()}>
        <button
          type="button"
          class="button ghost max-md:hidden"
          onClick={() => editor.autoLayout()}
          disabled={editor.diagram().variables.length < 2}
          aria-label="整列"
          title="変数の配置を自動で整える（元に戻せます）"
        >
          <LayoutIcon />
          <span>整列</span>
        </button>
      </Show>
      <div
        class="flex items-center gap-1 border-l border-line pl-3 max-md:hidden"
        role="group"
        aria-label="ファイル"
      >
        <Show when={editor.editable()}>
          <button
            type="button"
            class="button ghost"
            onClick={() => editor.newDiagram()}
            aria-label="新規"
            title="新しい図を作る（元に戻せます）"
          >
            <FileIcon />
            <span>新規</span>
          </button>
          <button
            type="button"
            class="button ghost"
            onClick={() => props.onOpenDialog("import")}
            aria-label="読み込み"
            title="JSON を貼り付けるか、ファイルから読み込む"
          >
            <OpenIcon />
            <span>読み込み</span>
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
          <span>画像</span>
        </button>
        <button
          type="button"
          class="button primary"
          onClick={() => props.onOpenDialog("export")}
          aria-label="JSON を書き出す"
          title={`JSON をコピーするか、ファイルに保存する（${mod}S でファイルに保存）`}
        >
          <SaveIcon />
          <span>JSON を書き出す</span>
        </button>
      </div>
      <button
        type="button"
        class="icon-button hidden max-md:inline-grid max-md:size-11"
        onClick={() => props.onOpenDialog("menu")}
        aria-label="メニュー"
        aria-haspopup="dialog"
      >
        <MoreIcon />
      </button>
    </header>
  );
}
