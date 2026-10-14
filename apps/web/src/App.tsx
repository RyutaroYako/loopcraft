import { Show, createSignal, onSettled, untrack } from "solid-js";
import { AutosaveContext, setupAutosave } from "./editor/autosave.ts";
import { createEditor, EditorContext } from "./editor/editor.ts";
import { createNotices } from "./editor/notices.ts";
import { captureDiagram } from "./editor/screenshot.ts";
import { resolveStartup, type Startup } from "./editor/startup.ts";
import { Canvas } from "./ui/Canvas.tsx";
import { ExportDialog, ImportDialog } from "./ui/JsonDialogs.tsx";
import { NoticeView } from "./ui/NoticeView.tsx";
import { ScreenshotDialog } from "./ui/ScreenshotDialog.tsx";
import { Sidebar } from "./ui/Sidebar.tsx";
import { Toolbar, type DialogKind } from "./ui/Toolbar.tsx";

/** Enter を自前で扱う要素（ボタンやリンクなど）。ここでの Enter は横取りしない */
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
  // 起動時の情報は描画中に変わらないので、最初に一度だけ解決する
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
    // ダイアログを開いている間は、図への操作のショートカットを効かせない
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

  // どこかで取りこぼした例外も、黙って失敗させずに画面へ出す
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
          class={["app", { dropping: dropping(), viewing: !editor.editable() }]}
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
          <main class="workspace">
            <Canvas svgRef={(svg) => (canvasSvg = svg)} />
            <Sidebar />
          </main>
          <NoticeView />
          <Show when={dialog() === "import"}>
            <ImportDialog onClose={closeDialog} />
          </Show>
          <Show when={dialog() === "export"}>
            <ExportDialog onClose={closeDialog} />
          </Show>
          <Show when={dialog() === "screenshot"}>
            <ScreenshotDialog capture={() => captureDiagram(canvasSvg!)} onClose={closeDialog} />
          </Show>
          <div class="drop-overlay" aria-hidden="true">
            <p>JSON ファイルをドロップして読み込む</p>
          </div>
        </div>
      </AutosaveContext>
    </EditorContext>
  );
}

export default App;
