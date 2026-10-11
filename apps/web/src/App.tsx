import { createSignal, onSettled, untrack } from "solid-js";
import { AutosaveContext, setupAutosave } from "./editor/autosave.ts";
import { createEditor, EditorContext } from "./editor/editor.ts";
import { createNotices } from "./editor/notices.ts";
import { resolveStartup, type Startup } from "./editor/startup.ts";
import { Canvas } from "./ui/Canvas.tsx";
import { NoticeView } from "./ui/NoticeView.tsx";
import { Sidebar } from "./ui/Sidebar.tsx";
import { Toolbar } from "./ui/Toolbar.tsx";

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
  const { initial, store, editable, readonly, initialStatus } = resolveStartup(startup);
  const editor = createEditor(initial, { editable });
  const notices = createNotices({ editor, store, startup, autosave: () => autosave });
  const autosave = setupAutosave(editor, store, {
    initialStatus,
    onProblem: (status) => notices.explain(status),
    onReload: () => notices.reloaded(),
  });

  const [dropping, setDropping] = createSignal(false);

  const onKeyDown = (event: KeyboardEvent) => {
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
      <AutosaveContext value={{ status: autosave.status, store, explain: notices.explain }}>
        <div
          class={["app", { dropping: dropping(), viewing: !editor.editable() }]}
          onDragOver={(event) => {
            if (!hasFiles(event)) return;
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
          <Toolbar readonly={readonly} />
          <main class="workspace">
            <Canvas />
            <Sidebar />
          </main>
          <NoticeView />
          <div class="drop-overlay" aria-hidden="true">
            <p>JSON ファイルをドロップして読み込む</p>
          </div>
        </div>
      </AutosaveContext>
    </EditorContext>
  );
}

export default App;
