import type { JSX } from "@solidjs/web";
import { createSignal, onCleanup, onSettled } from "solid-js";
import { CheckIcon, CloseIcon, CopyIcon } from "./icons.tsx";

export function Dialog(props: {
  title: string;
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
      class={["dialog", props.class]}
      aria-label={props.title}
      onClose={() => props.onClose()}
      onClick={(event) => {
        // 座標で枠の外かを測らないのは、背景のクリックは dialog 自身に当たるため
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <header class="dialog-header">
        <h2 class="dialog-title">{props.title}</h2>
        <button
          type="button"
          class="icon-button"
          onClick={() => dialog!.close()}
          aria-label="閉じる"
        >
          <CloseIcon />
        </button>
      </header>
      <div class="dialog-body">{props.children}</div>
      <footer class="dialog-footer">{props.footer}</footer>
    </dialog>
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
