import * as edit from "@loopcraft/core/edit";
import { createEmptyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import type { Diagram, LinkId } from "@loopcraft/core/schema";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import App from "./App.tsx";
import type { Startup } from "./editor/startup.ts";
import type { DocumentStore } from "./editor/store.ts";
import "./styles.css";

let dispose: (() => void) | undefined;

beforeEach(() => localStorage.clear());
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

function mount(startup: Startup) {
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(() => <App startup={startup} />, root);
}

function browserStartup(diagram?: Diagram): Startup {
  return {
    kind: "browser",
    stored: diagram ? { status: "ok", diagram } : { status: "empty" },
  };
}

function fileStartup(diagram: Diagram, editable: boolean): Startup {
  const store: DocumentStore = {
    kind: "file",
    label: "growth.json",
    save: async () => ({ ok: true }),
    watch: () => () => {},
    reload: async () => undefined,
  };
  return {
    kind: "file",
    session: { token: "t", file: "growth.json", editable, readonly: false },
    loaded: { status: "ok", diagram, revision: "r" },
    store,
  };
}

const canvas = () => page.getByRole("group", { name: "システム図のキャンバス" });
const loopItems = () => document.querySelectorAll(".loop-item");

describe("エディタ", () => {
  it("サンプルを開くと、出来事とループが並ぶ", async () => {
    mount(browserStartup());
    await expect.element(page.getByRole("heading", { name: /最初の出来事を置いて/ })).toBeVisible();
    await page.getByRole("button", { name: "サンプルを開く" }).click();
    await expect.element(page.getByRole("button", { name: "社員数", exact: true })).toBeVisible();
    await expect.element(page.getByRole("button", { name: /成長エンジン/ }).first()).toBeVisible();
    expect(loopItems()).toHaveLength(4);
  });

  it("キャンバスをダブルクリックして出来事を足し、名前を付ける", async () => {
    mount(browserStartup(createEmptyDiagram()));
    await userEvent.dblClick(canvas(), { position: { x: 400, y: 300 } });
    const input = page.getByRole("textbox", { name: "出来事の名前" });
    await expect.element(input).toHaveFocus();
    await userEvent.fill(input, "顧客満足度");
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("button", { name: "顧客満足度", exact: true }))
      .toBeVisible();
  });

  it("出来事の右端の点をドラッグして関連を引くと、ループが見つかる", async () => {
    const diagram = edit.removeLinks(createSampleDiagram(), new Set(["l_join" as LinkId]));
    mount(browserStartup(diagram));
    await expect.element(page.getByRole("button", { name: "採用数", exact: true })).toBeVisible();
    const before = loopItems().length;
    const handle = document.querySelector('[data-variable-id="hiring"] .node-handle')!;
    const target = document.querySelector('[data-variable-id="staff"] .node-body')!;
    await userEvent.dragAndDrop(page.elementLocator(handle), page.elementLocator(target));
    await expect.poll(() => loopItems().length).toBeGreaterThan(before);
    await expect.element(page.getByText("関連", { exact: true })).toBeVisible();
  });

  it("フォーカスした出来事を Delete で消す", async () => {
    mount(browserStartup(createSampleDiagram()));
    const node = page.getByRole("button", { name: "離職数", exact: true });
    await expect.element(node).toBeVisible();
    (node.element() as SVGGElement).focus();
    await userEvent.keyboard("{Delete}");
    await expect.element(node).not.toBeInTheDocument();
  });
});

describe("serve で開いたとき", () => {
  it("閲覧モードでは編集できず、編集モードに切り替えると編集できる", async () => {
    mount(fileStartup(createSampleDiagram(), false));
    await expect.element(page.getByRole("radio", { name: "閲覧" })).toBeChecked();
    await expect.element(page.getByText("growth.json")).toBeVisible();
    await userEvent.dblClick(canvas(), { position: { x: 300, y: 120 } });
    expect(document.querySelector(".inline-label")).toBeNull();

    await page.getByRole("radio", { name: "編集" }).click();
    await userEvent.dblClick(canvas(), { position: { x: 300, y: 120 } });
    await expect.element(page.getByRole("textbox", { name: "出来事の名前" })).toHaveFocus();
  });
});
