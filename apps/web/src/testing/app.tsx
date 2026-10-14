import type { Diagram } from "@loopcraft/core/schema";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import App from "../App.tsx";
import type { Startup } from "../editor/startup.ts";
import type { DocumentStore, ReloadResult, SaveResult, WatchHandlers } from "../editor/store.ts";
import "../styles.css";

let dispose: (() => void) | undefined;

/** App を描く。前に描いたものは片付ける */
export function mount(startup: Startup) {
  unmount();
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(() => <App startup={startup} />, root);
}

function unmount() {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
}

export function cleanup() {
  unmount();
  localStorage.clear();
  // 失敗したテストが差し替えたままの click などを、次のテストに持ち越さない
  vi.restoreAllMocks();
}

export function browserStartup(diagram?: Diagram): Startup {
  return {
    kind: "browser",
    stored: diagram ? { status: "ok", diagram } : { status: "empty" },
  };
}

/** serve で開いたときの保存先。保存や読み直しの結果と、外部からの知らせを差し替えられる */
export function fakeFileStore() {
  let handlers: WatchHandlers | undefined;
  const control = {
    saveResult: { ok: true } as SaveResult,
    reloadResult: { ok: false, problems: [] } as ReloadResult,
    saved: [] as Diagram[],
    /** watch に渡された知らせ先。外部での変更や切断を起こす */
    handlers: () => handlers!,
  };
  const store: DocumentStore = {
    kind: "file",
    label: "growth.json",
    save: async (diagram) => {
      control.saved.push(diagram);
      return control.saveResult;
    },
    watch: (next) => {
      handlers = next;
      return () => {};
    },
    reload: async () => control.reloadResult,
  };
  return { store, control };
}

export function fileStartup(
  loaded: Extract<Startup, { kind: "file" }>["loaded"],
  options: { readonly?: boolean; store?: DocumentStore } = {},
): Startup {
  return {
    kind: "file",
    session: {
      token: "t",
      file: "growth.json",
      readonly: options.readonly ?? false,
    },
    loaded,
    store: options.store ?? fakeFileStore().store,
  };
}

export const canvas = () => page.getByRole("group", { name: "システム図のキャンバス" });
export const node = (name: string) => page.getByRole("button", { name, exact: true });
export const notice = () => document.querySelector(".notice");

/** 出来事の要素。data-variable-id で引く */
export function nodeElement(id: string) {
  return document.querySelector<SVGGElement>(`[data-variable-id="${id}"]`)!;
}

/** 要素の中心の画面座標 */
export function centerOf(element: Element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** キャンバスの左上からの位置を、画面座標にする */
export function canvasPoint(x: number, y: number) {
  const rect = document.querySelector(".canvas-svg")!.getBoundingClientRect();
  return { x: rect.left + x, y: rect.top + y };
}

const POINTER = { pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true };

/**
 * 要素の上で押し、指定した位置まで動かして離す。途中の移動も送る。
 * 実際のブラウザでは操作のたびに別のタスクになり、その間に描画の更新が済むので、ここでも毎回反映させる
 */
export function dragFrom(
  target: Element,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: { end?: "pointerup" | "pointercancel"; pointerId?: number } = {},
) {
  const init = { ...POINTER, pointerId: options.pointerId ?? 1 };
  target.dispatchEvent(
    new PointerEvent("pointerdown", { ...init, clientX: from.x, clientY: from.y, button: 0 }),
  );
  flush();
  const svg = document.querySelector(".canvas-svg")!;
  for (const step of [0.25, 0.5, 1]) {
    svg.dispatchEvent(
      new PointerEvent("pointermove", {
        ...init,
        clientX: from.x + (to.x - from.x) * step,
        clientY: from.y + (to.y - from.y) * step,
      }),
    );
    flush();
  }
  svg.dispatchEvent(
    new PointerEvent(options.end ?? "pointerup", { ...init, clientX: to.x, clientY: to.y }),
  );
  flush();
}

/**
 * ダウンロードを横取りして、ファイル名を集める。
 * 実際に保存ダイアログやダウンロードを起こさないため
 */
export function captureDownloads() {
  const files: string[] = [];
  const spy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    files.push(this.download);
  });
  return { files, restore: () => spy.mockRestore() };
}

/** ファイル選択ダイアログの代わりに、渡したファイルを選んだことにする（undefined ならキャンセル） */
export function chooseFile(file: File | undefined) {
  const spy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
    this: HTMLInputElement,
  ) {
    if (this.type !== "file") return;
    spy.mockRestore();
    if (!file) {
      this.dispatchEvent(new Event("cancel"));
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    this.files = transfer.files;
    this.dispatchEvent(new Event("change"));
  });
}

export function jsonFile(diagram: Diagram, name = "diagram.json") {
  return new File([JSON.stringify(diagram)], name, { type: "application/json" });
}

export { page, userEvent };
