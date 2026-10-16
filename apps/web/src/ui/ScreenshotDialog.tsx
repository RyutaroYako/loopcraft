import { Show, createSignal, onCleanup, onSettled, useContext } from "solid-js";
import { EditorContext } from "../editor/editor.ts";
import { downloadBlob, fileNameOf } from "../editor/file.ts";
import { CopyButton, Dialog, DialogError, DialogSpacer } from "./Dialog.tsx";
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
      width="w-[min(960px,calc(100vw-32px))]"
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
          <DialogSpacer />
          <CopyButton
            disabled={!blob()}
            copy={() => navigator.clipboard.write([new ClipboardItem({ "image/png": blob()! })])}
          />
        </>
      }
    >
      <div class="grid min-h-60 place-items-center rounded-md border border-line bg-canvas p-4">
        <Show when={shot().status === "capturing"}>
          <p class="text-base text-muted">画像を作っています…</p>
        </Show>
        <Show when={failed()} keyed>
          {(current) => <DialogError title="画像を作れませんでした" errors={[current.error]} />}
        </Show>
        <Show when={ready()} keyed>
          {(current) => (
            <img
              class="block max-h-[calc(100dvh-280px)] max-w-full object-contain"
              src={current.url}
              alt={`${editor.current().title || "無題のシステム図"} の画像`}
            />
          )}
        </Show>
      </div>
    </Dialog>
  );
}
