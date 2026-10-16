import { Show, createSignal, onSettled, untrack } from "solid-js";
import { AutosaveContext, setupAutosave } from "./editor/autosave.ts";
import { createEditor, EditorContext } from "./editor/editor.ts";
import { createNotices } from "./editor/notices.ts";
import { captureDiagram } from "./editor/screenshot.ts";
import { resolveStartup, type Startup } from "./editor/startup.ts";
import { Canvas } from "./ui/Canvas.tsx";
import { ExportDialog, ImportDialog } from "./ui/JsonDialogs.tsx";
import { MenuDialog } from "./ui/MenuDialog.tsx";
import { NoticeView } from "./ui/NoticeView.tsx";
import { ScreenshotDialog } from "./ui/ScreenshotDialog.tsx";
import { Sidebar } from "./ui/Sidebar.tsx";
import { Toolbar, type DialogKind } from "./ui/Toolbar.tsx";

/** ここで Enter を横取りしないのは、ボタンやリンクなどが自前で Enter を扱うため */
function isInteractive(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest("button, a, input, textarea, select, [contenteditable], [role=button]") !== null
  );
}

function isTextInput(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function App(props: { startup: Startup }) {
  // 追跡しないのは、起動時の情報が描画中に変わらないため
  const startup = untrack(() => props.startup);
  const { initial, store, readonly, initialStatus } = resolveStartup(startup);
  const editor = createEditor(initial, { editable: !readonly });
  const notices = createNotices({ editor, store, startup, readonly, autosave: () => autosave });
  const autosave = setupAutosave(editor, store, {
    initialStatus,
    onProblem: (status) => notices.explain(status),
    onReload: () => notices.reloaded(),
    onUnwatched: (detail) => notices.unwatched(detail),
    onRecovered: () => notices.recovered(),
  });

  const [dropping, setDropping] = createSignal(false);
  const [dialog, setDialog] = createSignal<DialogKind | null>(null);
  let canvasSvg: SVGSVGElement | undefined;
  const closeDialog = () => setDialog(null);

  const onKeyDown = (event: KeyboardEvent) => {
    if (dialog() !== null) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "z" && !isTextInput(event.target)) {
      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
      return;
    }
    if (mod && event.key.toLowerCase() === "y" && !isTextInput(event.target)) {
      event.preventDefault();
      editor.redo();
      return;
    }
    if (mod && event.key.toLowerCase() === "s") {
      event.preventDefault();
      editor.exportFile();
      return;
    }
    if (isTextInput(event.target)) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      editor.deleteSelection();
    } else if (event.key === "Escape") {
      editor.stopConnecting();
      editor.select(null);
      editor.setFocusedLoop(null);
    } else if (event.key === "Enter" && !isInteractive(event.target)) {
      const selected = editor.selection();
      if (selected?.kind === "variable") {
        event.preventDefault();
        editor.setEditingVariable(selected.id);
      }
    }
  };

  const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

  const onUnhandled = (event: PromiseRejectionEvent | ErrorEvent) => {
    const reason = "reason" in event ? event.reason : (event.error ?? event.message);
    editor.notify({
      tone: "error",
      title: "予期しないエラーが起きました",
      details: [String(reason)],
    });
  };

  onSettled(() => {
    notices.atStartup(initialStatus);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("unhandledrejection", onUnhandled);
    window.addEventListener("error", onUnhandled);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("unhandledrejection", onUnhandled);
      window.removeEventListener("error", onUnhandled);
    };
  });

  return (
    <EditorContext value={editor}>
      <AutosaveContext
        value={{
          status: autosave.status,
          unwatched: autosave.unwatched,
          store,
          explain: notices.explain,
          explainUnwatched: (detail) => notices.unwatched(detail),
        }}
      >
        <div
          class={[
            "app group/app grid h-dvh grid-rows-[56px_minmax(0,1fr)] overflow-hidden",
            { dropping: dropping(), viewing: !editor.editable() },
          ]}
          onDragOver={(event) => {
            if (!hasFiles(event) || dialog() !== null) return;
            event.preventDefault();
            setDropping(true);
          }}
          onDragLeave={(event) => {
            if (event.relatedTarget === null) setDropping(false);
          }}
          onDrop={(event) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            setDropping(false);
            const file = event.dataTransfer?.files[0];
            if (file) void editor.importFile(file);
          }}
        >
          <Toolbar readonly={readonly} onOpenDialog={setDialog} />
          {/* 狭い画面でページごとスクロールさせないのは、キャンバスのパンとページのスクロールが同じ指の操作で取り合うため */}
          <main class="grid min-h-0 grid-cols-[minmax(0,1fr)_368px] max-md:grid-cols-[minmax(0,1fr)] max-md:grid-rows-[minmax(0,1fr)_auto]">
            <Canvas svgRef={(svg) => (canvasSvg = svg)} />
            <Sidebar />
          </main>
          <NoticeView />
          <Show when={dialog() === "menu"}>
            {/* 確かめずに閉じないのは、他のダイアログへ切り替えた後に閉じた知らせが届くと、その切り替えを取り消すため */}
            <MenuDialog
              onOpenDialog={setDialog}
              onClose={() => dialog() === "menu" && closeDialog()}
            />
          </Show>
          <Show when={dialog() === "import"}>
            <ImportDialog onClose={closeDialog} />
          </Show>
          <Show when={dialog() === "export"}>
            <ExportDialog onClose={closeDialog} />
          </Show>
          <Show when={dialog() === "screenshot"}>
            <ScreenshotDialog capture={() => captureDiagram(canvasSvg!)} onClose={closeDialog} />
          </Show>
          <div
            class="pointer-events-none fixed inset-3 z-30 grid place-items-center rounded-2xl border-[1.5px] border-dashed border-accent bg-veil text-lg font-medium text-accent-strong opacity-0 transition-opacity group-[.dropping]/app:opacity-100"
            aria-hidden="true"
          >
            <p>JSON ファイルをドロップして読み込む</p>
          </div>
        </div>
      </AutosaveContext>
    </EditorContext>
  );
}

export default App;
