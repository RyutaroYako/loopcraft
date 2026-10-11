import { createSignal, onSettled } from "solid-js";
import { createEditor, EditorContext } from "./editor/editor.ts";
import { loadStoredDiagram } from "./editor/storage.ts";
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

function App() {
  const editor = createEditor(loadStoredDiagram() ?? createEmptyDiagram());
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

  onSettled(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
