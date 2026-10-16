import { parseDiagramJson, stringifyDiagram } from "@loopcraft/core/io";
import { Show, createSignal, untrack, useContext } from "solid-js";
import { EditorContext } from "../editor/editor.ts";
import { pickJsonFile } from "../editor/file.ts";
import { CopyButton, Dialog, DialogError, DialogSpacer } from "./Dialog.tsx";
import { OpenIcon, SaveIcon } from "./icons.tsx";

export function ImportDialog(props: { onClose: () => void }) {
  const editor = useContext(EditorContext);
  const [text, setText] = createSignal("");
  const [errors, setErrors] = createSignal<string[]>([]);
  let dialog: HTMLDialogElement | undefined;
  const close = () => dialog?.close();

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const result = parseDiagramJson(text());
    if (!result.ok) {
      setErrors(
        result.errors.map((error) =>
          error.path ? `${error.path}: ${error.message}` : error.message,
        ),
      );
      return;
    }
    editor.replaceDiagram(result.diagram);
    editor.notify({ tone: "info", title: "JSON を読み込みました" });
    close();
  };

  const openFile = async () => {
    const file = await pickJsonFile();
    if (!file) return;
    close();
    await editor.importFile(file);
  };

  return (
    <Dialog
      title="JSON を読み込む"
      onClose={props.onClose}
      dialogRef={(element) => (dialog = element)}
      footer={
        <>
          <button type="button" class="button ghost" onClick={openFile}>
            <OpenIcon />
            ファイルから選ぶ
          </button>
          <DialogSpacer />
          <button type="button" class="button" onClick={close}>
            キャンセル
          </button>
          <button
            type="submit"
            form="import-json"
            class="button primary"
            disabled={text().trim() === ""}
          >
            読み込む
          </button>
        </>
      }
    >
      <form id="import-json" class="field" onSubmit={submit}>
        <label class="field-label" for="import-json-text">
          図の JSON を貼り付けてください。今の図は置き換わります（元に戻せます）
        </label>
        <textarea
          id="import-json-text"
          class="min-h-[280px] font-mono text-sm leading-normal whitespace-pre"
          value={text()}
          onInput={(event) => {
            setText(event.currentTarget.value);
            setErrors([]);
          }}
          placeholder='{ "version": 1, "title": "…", … }'
          spellcheck={false}
          autofocus
        />
      </form>
      <Show when={errors().length > 0}>
        <DialogError title="読み込めませんでした" errors={errors()} />
      </Show>
    </Dialog>
  );
}

export function ExportDialog(props: { onClose: () => void }) {
  const editor = useContext(EditorContext);
  // 図に追従させないのは、開いている間は図を編集できず変わらないため
  const text = untrack(() => stringifyDiagram(editor.current()));
  return (
    <Dialog
      title="JSON を書き出す"
      onClose={props.onClose}
      footer={
        <>
          <button type="button" class="button ghost" onClick={() => editor.exportFile()}>
            <SaveIcon />
            ファイルに保存
          </button>
          <DialogSpacer />
          <CopyButton copy={() => navigator.clipboard.writeText(text)} />
        </>
      }
    >
      <label class="field">
        <span class="field-label">この JSON を貼り付ければ、別の場所で同じ図を開けます</span>
        <textarea
          class="min-h-[280px] font-mono text-sm leading-normal whitespace-pre"
          value={text}
          readonly
          spellcheck={false}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
    </Dialog>
  );
}
