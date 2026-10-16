import type { JSX } from "@solidjs/web";
import { createSignal, onCleanup, onSettled } from "solid-js";
import { DetailList } from "./DetailList.tsx";
import { CheckIcon, CloseIcon, CopyIcon } from "./icons.tsx";

export function Dialog(props: {
  title: string;
  /** 既定の幅を class で上書きしないのは、同じプロパティのユーティリティは書いた順でなく生成順で勝ち負けが決まるため */
  width?: string;
  bodyClass?: string;
  class?: string;
  onClose: () => void;
  /** 中のボタンから props.onClose を直接呼ばないのは、close() で閉じれば onClose も呼ばれるため */
  dialogRef?: (element: HTMLDialogElement) => void;
  children: JSX.Element;
  footer: JSX.Element;
}) {
  let dialog: HTMLDialogElement | undefined;
  onSettled(() => {
    dialog!.showModal();
  });
  return (
    <dialog
      ref={(element) => {
        dialog = element;
        props.dialogRef?.(element);
      }}
      class={[
        "m-auto max-h-[calc(100dvh-64px)] rounded-xl border border-line bg-surface text-ink shadow-float",
        "open:flex open:animate-dialog-in open:flex-col",
        "backdrop:animate-backdrop-in backdrop:bg-scrim",
        props.width ?? "w-[min(640px,calc(100vw-32px))]",
        props.class,
      ]}
      aria-label={props.title}
      onClose={() => props.onClose()}
      onClick={(event) => {
        // 座標で枠の外かを測らないのは、背景のクリックは dialog 自身に当たるため
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <header class="flex items-center justify-between gap-3 pt-3 pr-3 pb-1 pl-5">
        <h2 class="text-lg font-semibold tracking-heading">{props.title}</h2>
        <button
          type="button"
          class="icon-button"
          onClick={() => dialog!.close()}
          aria-label="閉じる"
        >
          <CloseIcon />
        </button>
      </header>
      <div class={["grid min-h-0 overflow-auto", props.bodyClass ?? "gap-3 px-5 pt-2 pb-4"]}>
        {props.children}
      </div>
      <footer class="flex items-center gap-2 border-t border-line px-5 pt-3 pb-4">
        {props.footer}
      </footer>
    </dialog>
  );
}

export function DialogSpacer() {
  return <span class="flex-1" />;
}

export function DialogError(props: { title: string; errors: string[] }) {
  return (
    <div
      class="grid gap-1 rounded-sm border border-negative-line bg-negative-soft px-3 py-2.5"
      role="alert"
    >
      <p class="font-semibold text-negative">{props.title}</p>
      <DetailList items={props.errors} />
    </div>
  );
}

const COPIED_MS = 2000;

export function CopyButton(props: {
  copy: () => Promise<void>;
  disabled?: boolean;
  label?: string;
}) {
  const [state, setState] = createSignal<"idle" | "copied" | "failed">("idle");
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  const run = async () => {
    try {
      await props.copy();
      setState("copied");
    } catch {
      setState("failed");
    }
    clearTimeout(timer);
    timer = setTimeout(() => setState("idle"), COPIED_MS);
  };
  return (
    <button type="button" class="button primary" onClick={run} disabled={props.disabled}>
      {state() === "copied" ? <CheckIcon /> : <CopyIcon />}
      <span aria-live="polite">
        {state() === "copied"
          ? "コピーしました"
          : state() === "failed"
            ? "コピーできませんでした"
            : (props.label ?? "コピー")}
      </span>
    </button>
  );
}
