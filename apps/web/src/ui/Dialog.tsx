import type { JSX } from "@solidjs/web";
import { createSignal, onCleanup, onSettled } from "solid-js";
import { CheckIcon, CloseIcon, CopyIcon } from "./icons.tsx";

/** 開いている間はほかの操作を受け付けないダイアログ。描かれたら開き、閉じたら onClose を呼ぶ */
export function Dialog(props: {
  title: string;
  class?: string;
  onClose: () => void;
  /** 中のボタンから閉じるときに使う。close() で閉じると onClose も呼ばれる */
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
        // 枠の外（背景）を押したら閉じる
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

/** クリップボードへコピーし、しばらく結果をボタンに出す */
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
