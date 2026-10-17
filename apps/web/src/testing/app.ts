import type { Diagram } from "@loopcraft/core/schema";
import { createApp, nextTick } from "vue";
import type { App as VueApp } from "vue";
import { vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import "../styles/tokens.css";
import "../styles/base.css";
import App from "../App.vue";
import type { Startup } from "../persistence/startup.ts";
import type {
  DocumentStore,
  ReloadResult,
  SaveResult,
  WatchHandlers,
} from "../persistence/store.ts";

let app: VueApp | undefined;

export function mount(startup: Startup) {
  unmount();
  const root = document.createElement("div");
  document.body.append(root);
  app = createApp(App, { startup });
  app.mount(root);
}

function unmount() {
  app?.unmount();
  app = undefined;
  document.body.replaceChildren();
}

export function rendered() {
  return nextTick();
}

export function cleanup() {
  unmount();
  localStorage.clear();
  // ここで戻すのは、失敗したテストが差し替えたままの click などを、次のテストに持ち越さないため
  vi.restoreAllMocks();
}

export function browserStartup(diagram?: Diagram): Startup {
  return {
    kind: "browser",
    stored: diagram ? { status: "ok", diagram } : { status: "empty" },
  };
}

export function fakeFileStore() {
  let handlers: WatchHandlers | undefined;
  const control = {
    saveResult: { ok: true } as SaveResult,
    reloadResult: { ok: false, problems: [] } as ReloadResult,
    saved: [] as Diagram[],
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

export const inspector = () =>
  document.querySelector<HTMLElement>('section[aria-label="選択中の項目"]');
export const canvasSvg = () =>
  document.querySelector<SVGSVGElement>('svg[aria-label="システム図のキャンバス"]')!;
export const inlineLabel = () =>
  document.querySelector<HTMLInputElement>('input[aria-label="変数の名前"]');
export const canvas = () => page.getByRole("group", { name: "システム図のキャンバス" });
export const node = (name: string) => page.getByRole("button", { name, exact: true });
/** 先頭に絞るのは、お知らせの中の詳しい説明も箇条書きで、項目として数えられるため */
export const notice = () =>
  page
    .getByRole("region", { name: /^お知らせ/ })
    .getByRole("listitem")
    .first();
/** getByRole で取らないのは、広い画面では display: none で、アクセシビリティツリーに載らないため */
export const expandButton = () =>
  [...document.querySelectorAll<HTMLElement>('section[aria-label="選んだ項目"] button')].find(
    (button) => button.textContent?.trim() === "詳しく",
  )!;

export function nodeElement(id: string) {
  return document.querySelector<SVGGElement>(`[data-variable-id="${id}"]`)!;
}

export function centerOf(element: Element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** x, y はキャンバスの左上から */
export function canvasPoint(x: number, y: number) {
  const rect = canvasSvg().getBoundingClientRect();
  return { x: rect.left + x, y: rect.top + y };
}

const POINTER = { pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true };

/** 毎回描き終わるのを待つのは、実際のブラウザでは操作のたびに別のタスクになり、その間に描画の更新が済むため */
export async function dragFrom(
  target: Element,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: { end?: "pointerup" | "pointercancel"; pointerId?: number } = {},
) {
  const init = { ...POINTER, pointerId: options.pointerId ?? 1 };
  target.dispatchEvent(
    new PointerEvent("pointerdown", { ...init, clientX: from.x, clientY: from.y, button: 0 }),
  );
  await rendered();
  const svg = canvasSvg();
  for (const step of [0.25, 0.5, 1]) {
    svg.dispatchEvent(
      new PointerEvent("pointermove", {
        ...init,
        clientX: from.x + (to.x - from.x) * step,
        clientY: from.y + (to.y - from.y) * step,
      }),
    );
    await rendered();
  }
  svg.dispatchEvent(
    new PointerEvent(options.end ?? "pointerup", { ...init, clientX: to.x, clientY: to.y }),
  );
  await rendered();
}

/** click を横取りするのは、実際に保存ダイアログやダウンロードを起こさないため */
export function captureDownloads() {
  const files: string[] = [];
  const spy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    files.push(this.download);
  });
  return { files, restore: () => spy.mockRestore() };
}

/** click を差し替えるのは、本物のファイル選択ダイアログはテストから操作できないため。undefined ならキャンセル */
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
