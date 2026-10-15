import { Show, createSignal, onCleanup, onSettled, useContext } from "solid-js";
import { EditorContext } from "../editor/editor.ts";
import { downloadBlob, fileNameOf } from "../editor/file.ts";
import { CopyButton, Dialog } from "./Dialog.tsx";
import { SaveIcon } from "./icons.tsx";

type Shot =
  | { status: "capturing" }
  | { status: "ready"; blob: Blob; url: string }
  | { status: "failed"; error: string };

export function ScreenshotDialog(props: { capture: () => Promise<Blob>; onClose: () => void }) {
  const editor = useContext(EditorContext);
  const [shot, setShot] = createSignal<Shot>({ status: "capturing" });
  let url: string | undefined;
  onCleanup(() => {
    if (url) URL.revokeObjectURL(url);
  });

  onSettled(() => {
    // 選択を外してすぐ写さないのは、描き直される前の選択の枠や名前の入力欄が写るため
    editor.select(null);
    editor.setEditingVariable(null);
    requestAnimationFrame(() => {
      props.capture().then(
        (blob) => {
          url = URL.createObjectURL(blob);
          setShot({ status: "ready", blob, url });
        },
        (error: unknown) =>
          setShot({
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          }),
      );
    });
  });

  const ready = () => {
    const current = shot();
    return current.status === "ready" ? current : undefined;
  };
  const failed = () => {
    const current = shot();
    return current.status === "failed" ? current : undefined;
  };
  const blob = () => ready()?.blob;

  return (
    <Dialog
      title="画像として書き出す"
      class="screenshot-dialog"
      onClose={props.onClose}
      footer={
        <>
          <button
            type="button"
            class="button ghost"
            disabled={!blob()}
            onClick={() => {
              const current = blob();
              if (current) downloadBlob(current, `${fileNameOf(editor.current().title)}.png`);
            }}
          >
            <SaveIcon />
            PNG を保存
          </button>
          <span class="dialog-spacer" />
          <CopyButton
            disabled={!blob()}
            copy={() => navigator.clipboard.write([new ClipboardItem({ "image/png": blob()! })])}
          />
        </>
      }
    >
      <div class="screenshot-preview">
        <Show when={shot().status === "capturing"}>
          <p class="screenshot-status">画像を作っています…</p>
        </Show>
        <Show when={failed()} keyed>
          {(current) => (
            <div class="dialog-error" role="alert">
              <p>画像を作れませんでした</p>
              <ul>
                <li>{current.error}</li>
              </ul>
            </div>
          )}
        </Show>
        <Show when={ready()} keyed>
          {(current) => (
            <img src={current.url} alt={`${editor.current().title || "無題のシステム図"} の画像`} />
          )}
        </Show>
      </div>
    </Dialog>
  );
}
