import { createSignal, onSettled } from "solid-js";
import { setupAutosave } from "./editor/autosave.ts";
import { createEditor, EditorContext, type Editor } from "./editor/editor.ts";
import { downloadText } from "./editor/file.ts";
import { loadStoredDiagram, type StoredDiagram } from "./editor/storage.ts";
import { createEmptyDiagram } from "./model/io.ts";
import { Canvas } from "./ui/Canvas.tsx";
import { NoticeView } from "./ui/NoticeView.tsx";
import { Sidebar } from "./ui/Sidebar.tsx";
import { Toolbar } from "./ui/Toolbar.tsx";

function isTextInput(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** 前回の図を開けなかったことを知らせる。開けたときや初回は何もしない */
function reportRestore(editor: Editor, stored: StoredDiagram) {
  if (stored.status === "unavailable") {
    editor.notify({
      tone: "error",
      title: "このブラウザでは自動保存が使えません",
      details: ["「JSON を書き出す」でファイルに保存してください", String(stored.error)],
    });
  }
  if (stored.status === "invalid") {
    const { raw } = stored;
    editor.notify({
      tone: "error",
      title: "前回の図を開けませんでした",
      details: [
        stored.backupKey
          ? `元のデータはブラウザ内の ${stored.backupKey} に退避しました`
          : "元のデータを退避できませんでした。下のボタンから書き出してください",
        ...stored.errors,
      ],
      action: {
        label: "開けなかったデータを書き出す",
        run: () => downloadText(raw, "system-diagram-unreadable.json"),
      },
    });
  }
}

function App() {
  const stored = loadStoredDiagram();
  const editor = createEditor(stored.status === "ok" ? stored.diagram : createEmptyDiagram());
  setupAutosave(editor);
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
    } else if (event.key === "Enter") {
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
    const reason = "reason" in event ? event.reason : event.error;
    editor.notify({
      tone: "error",
      title: "予期しないエラーが起きました",
      details: [String(reason)],
    });
  };

  onSettled(() => {
    reportRestore(editor, stored);
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
      <div
        class={["app", { dropping: dropping() }]}
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
        <Toolbar />
        <main class="workspace">
          <Canvas />
          <Sidebar />
        </main>
        <NoticeView />
        <div class="drop-overlay" aria-hidden="true">
          <p>JSON ファイルをドロップして読み込む</p>
        </div>
      </div>
    </EditorContext>
  );
}

export default App;
