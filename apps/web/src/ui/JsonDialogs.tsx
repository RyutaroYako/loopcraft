import { parseDiagramJson, stringifyDiagram } from "@loopcraft/core/io";
import { For, Show, createSignal, untrack, useContext } from "solid-js";
import { EditorContext } from "../editor/editor.ts";
import { pickJsonFile } from "../editor/file.ts";
import { CopyButton, Dialog } from "./Dialog.tsx";
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
      class="json-dialog"
      onClose={props.onClose}
      dialogRef={(element) => (dialog = element)}
      footer={
        <>
          <button type="button" class="button ghost" onClick={openFile}>
            <OpenIcon />
            ファイルから選ぶ
          </button>
          <span class="dialog-spacer" />
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
          class="json-text"
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
        <div class="dialog-error" role="alert">
          <p>読み込めませんでした</p>
          <ul>
            <For each={errors().slice(0, 8)}>{(error) => <li>{error}</li>}</For>
          </ul>
          <Show when={errors().length > 8}>
            <p class="notice-more">ほか {errors().length - 8} 件</p>
          </Show>
        </div>
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
      class="json-dialog"
      onClose={props.onClose}
      footer={
        <>
          <button type="button" class="button ghost" onClick={() => editor.exportFile()}>
            <SaveIcon />
            ファイルに保存
          </button>
          <span class="dialog-spacer" />
          <CopyButton copy={() => navigator.clipboard.writeText(text)} />
        </>
      }
    >
      <label class="field">
        <span class="field-label">この JSON を貼り付ければ、別の場所で同じ図を開けます</span>
        <textarea
          class="json-text"
          value={text}
          readonly
          spellcheck={false}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
    </Dialog>
  );
}
