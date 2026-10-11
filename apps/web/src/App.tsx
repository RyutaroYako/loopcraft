import { createSignal, onSettled } from "solid-js";
import { AutosaveContext, setupAutosave, type AutosaveStatus } from "./editor/autosave.ts";
import { createEditor, EditorContext } from "./editor/editor.ts";
import { downloadText } from "./editor/file.ts";
import { loadStoredDiagram } from "./editor/storage.ts";
import { createEmptyDiagram } from "@loopcraft/core/io";
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

function App() {
  const stored = loadStoredDiagram();
  const editor = createEditor(stored.status === "ok" ? stored.diagram : createEmptyDiagram());
  const unreadable = stored.status === "invalid" ? stored : undefined;

  /** 自動保存の状態を、取れる操作と一緒に知らせる。ツールバーの表示からも呼ぶ */
  const explainAutosave = (status: AutosaveStatus) => {
    const resume = () => {
      editor.dismissNotice();
      autosave.resume();
    };
    if (status.kind === "failing") {
      editor.notify({
        tone: "error",
        title: "ブラウザに自動保存できません",
        details: ["「JSON を書き出す」でファイルに保存してください", String(status.error)],
        actions: [{ label: "JSON を書き出す", run: () => editor.exportFile() }],
      });
    } else if (status.kind === "suspended" && status.reason === "other-tab") {
      editor.notify({
        tone: "error",
        title: "別のタブでこの図が保存されました",
        details: [
          "上書きを防ぐため、このタブの自動保存を止めています",
          "別のタブの内容を使うときは、このタブを再読み込みしてください",
        ],
        actions: [{ label: "このタブの内容で保存し直す", run: resume }],
      });
    } else if (status.kind === "suspended" && status.reason === "unreadable") {
      editor.notify({
        tone: "error",
        title: "自動保存を止めています",
        details: [
          "前回開けなかった図を退避できなかったため、上書きしないよう止めています",
          "開けなかったデータを書き出して手元に残せたら、自動保存を再開してください",
        ],
        actions: [
          ...downloadUnreadableAction(),
          { label: "書き出したので自動保存を再開", run: resume },
        ],
      });
    }
  };

  const downloadUnreadableAction = () =>
    unreadable
      ? [
          {
            label: "開けなかったデータを書き出す",
            run: () => downloadText(unreadable.raw, "system-diagram-unreadable.json"),
          },
        ]
      : [];

  // 保存先が使えないときと、読み込めなかった前回の図を退避できなかったとき（書き出してもらうまで
  // 上書きしない）は、最初から問題のある状態として始めてツールバーにも出す
  const initialStatus: AutosaveStatus | undefined =
    stored.status === "unavailable"
      ? { kind: "failing", error: stored.error }
      : unreadable && unreadable.backupKey === undefined
        ? { kind: "suspended", reason: "unreadable" }
        : undefined;
  const autosave = setupAutosave(editor, { initialStatus, onProblem: explainAutosave });

  /** 前回の図を開けなかったことや、自動保存が使えないことを開いた時点で知らせる */
  const reportRestore = () => {
    if (initialStatus) {
      explainAutosave(initialStatus);
    } else if (unreadable?.backupKey) {
      editor.notify({
        tone: "error",
        title: "前回の図を開けませんでした",
        details: [
          "元のデータはブラウザ内に退避しました。「図の概要」の「退避したデータ」からいつでも書き出せます",
          ...unreadable.errors,
        ],
        actions: downloadUnreadableAction(),
      });
    }
  };

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
    reportRestore();
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
      <AutosaveContext value={{ status: autosave.status, explain: explainAutosave }}>
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
      </AutosaveContext>
    </EditorContext>
  );
}

export default App;
