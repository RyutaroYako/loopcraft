import * as edit from "@loopcraft/core/edit";
import { createEmptyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import type { LinkId } from "@loopcraft/core/schema";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  browserStartup,
  canvas,
  captureDownloads,
  cleanup,
  fakeFileStore,
  fileStartup,
  jsonFile,
  mount,
  node,
  nodeElement,
  notice,
  page,
  userEvent,
} from "./testing/app.tsx";

afterEach(cleanup);

const loopItems = () => document.querySelectorAll(".loop-item");
const ok = (diagram = createSampleDiagram()) => ({
  status: "ok" as const,
  diagram,
  revision: "r",
});

describe("エディタ", () => {
  it("サンプルを開くと、出来事とループが並ぶ", async () => {
    mount(browserStartup());
    await expect.element(page.getByRole("heading", { name: /最初の出来事を置いて/ })).toBeVisible();
    await page.getByRole("button", { name: "サンプルを開く" }).click();
    await expect.element(node("社員数")).toBeVisible();
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
    await expect.element(node("顧客満足度")).toBeVisible();
  });

  it("出来事の右端の点をドラッグして関連を引くと、ループが見つかる", async () => {
    const diagram = edit.removeLinks(createSampleDiagram(), new Set(["l_join" as LinkId]));
    mount(browserStartup(diagram));
    await expect.element(node("採用数")).toBeVisible();
    const before = loopItems().length;
    const handle = document.querySelector('[data-variable-id="hiring"] .node-handle')!;
    const target = document.querySelector('[data-variable-id="staff"] .node-body')!;
    await userEvent.dragAndDrop(page.elementLocator(handle), page.elementLocator(target));
    await expect.poll(() => loopItems().length).toBeGreaterThan(before);
    await expect.element(page.getByText("関連", { exact: true })).toBeVisible();
  });

  it("フォーカスした出来事を Delete で消す", async () => {
    mount(browserStartup(createSampleDiagram()));
    const target = node("離職数");
    await expect.element(target).toBeVisible();
    (target.element() as SVGGElement).focus();
    await userEvent.keyboard("{Delete}");
    await expect.element(target).not.toBeInTheDocument();
  });
});

describe("キーボード", () => {
  it("元に戻す・やり直すは Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y で、入力欄では横取りしない", async () => {
    mount(browserStartup(createSampleDiagram()));
    await expect.element(node("離職数")).toBeVisible();
    nodeElement("attrition").focus();
    await userEvent.keyboard("{Backspace}");
    await expect.element(node("離職数")).not.toBeInTheDocument();
    await userEvent.keyboard("{Control>}z{/Control}");
    await expect.element(node("離職数")).toBeVisible();
    await userEvent.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    await expect.element(node("離職数")).not.toBeInTheDocument();
    await userEvent.keyboard("{Control>}z{/Control}");
    await userEvent.keyboard("{Control>}y{/Control}");
    await expect.element(node("離職数")).not.toBeInTheDocument();

    const title = page.getByRole("textbox", { name: "図のタイトル" });
    await userEvent.click(title);
    await userEvent.keyboard("{Control>}z{/Control}{Delete}");
    await expect.element(node("離職数")).not.toBeInTheDocument();
  });

  it("Escape で選択を外し、Enter で選んだ出来事の名前を編集する", async () => {
    mount(browserStartup(createSampleDiagram()));
    await expect.element(node("売上")).toBeVisible();
    nodeElement("sales").focus();
    await expect.element(page.getByRole("heading", { name: "出来事" })).toBeVisible();
    (document.activeElement as HTMLElement).blur();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("textbox", { name: "出来事の名前" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("heading", { name: "図の概要" })).toBeVisible();
  });

  it("Ctrl+S で JSON を書き出す", async () => {
    const downloads = captureDownloads();
    try {
      mount(browserStartup(createSampleDiagram()));
      await expect.element(node("売上")).toBeVisible();
      await userEvent.keyboard("{Control>}s{/Control}");
      expect(downloads.files).toEqual(["組織の成長と人の負荷.json"]);
    } finally {
      downloads.restore();
    }
  });
});

describe("ファイルのドロップ", () => {
  it("JSON ファイルをドロップすると読み込み、ファイル以外は無視する", async () => {
    mount(browserStartup(createEmptyDiagram()));
    const app = document.querySelector(".app")!;
    const transfer = new DataTransfer();
    transfer.items.add(jsonFile(createSampleDiagram()));
    const dropping = () => {
      flush();
      return app.classList.contains("dropping");
    };
    app.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true }));
    expect(dropping()).toBe(false);
    app.dispatchEvent(
      new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }),
    );
    expect(dropping()).toBe(true);
    app.dispatchEvent(new DragEvent("dragleave", { bubbles: true, relatedTarget: app }));
    expect(dropping()).toBe(true);
    app.dispatchEvent(new DragEvent("dragleave", { bubbles: true }));
    expect(dropping()).toBe(false);
    app.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true }));
    app.dispatchEvent(
      new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }),
    );
    await expect.element(node("社員数")).toBeVisible();
    await expect.element(page.getByText("diagram.json を読み込みました")).toBeVisible();
  });
});

describe("案内", () => {
  it("取りこぼした例外を画面に出し、閉じられる", async () => {
    mount(browserStartup(createSampleDiagram()));
    await expect.element(node("売上")).toBeVisible();
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    await expect
      .element(page.getByRole("alert"))
      .toMatchTextContent(/予期しないエラーが起きました/);
    expect(notice()?.textContent).toContain("boom");

    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: "rejected",
      }),
    );
    await expect.element(page.getByRole("alert")).toMatchTextContent(/rejected/);
    await page.getByRole("button", { name: "閉じる" }).click();
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  });

  it("壊れたブラウザのデータは退避したことを知らせ、書き出せる", async () => {
    const downloads = captureDownloads();
    try {
      mount({
        kind: "browser",
        stored: { status: "invalid", raw: "{", errors: ["壊れています"], backupKey: "k" },
      });
      await expect
        .element(page.getByRole("alert"))
        .toMatchTextContent(/前回の図を開けませんでした/);
      await page.getByRole("button", { name: "開けなかったデータを書き出す" }).click();
      expect(downloads.files).toEqual(["system-diagram-unreadable.json"]);
    } finally {
      downloads.restore();
    }
  });

  it("serve の情報が読めなければ、ブラウザに保存することを知らせる", async () => {
    mount({ kind: "browser", stored: { status: "empty" }, sessionInvalid: true });
    await expect
      .element(page.getByRole("alert"))
      .toMatchTextContent(/loopcraft serve の情報を読めませんでした/);
    await expect.element(page.getByRole("button", { name: "ページを再読み込み" })).toBeVisible();
  });
});

describe("serve で開いたとき", () => {
  it("閲覧モードでは編集できず、編集モードに切り替えると編集できる", async () => {
    mount(fileStartup(ok(), { editable: false }));
    await expect.element(page.getByRole("radio", { name: "閲覧" })).toBeChecked();
    await expect.element(page.getByText("growth.json")).toBeVisible();
    await expect.element(page.getByText("閲覧モード", { exact: true })).toBeVisible();
    await userEvent.dblClick(canvas(), { position: { x: 300, y: 120 } });
    expect(document.querySelector(".inline-label")).toBeNull();

    await page.getByRole("radio", { name: "編集" }).click();
    await userEvent.dblClick(canvas(), { position: { x: 300, y: 120 } });
    await expect.element(page.getByRole("textbox", { name: "出来事の名前" })).toHaveFocus();
    await page.getByRole("radio", { name: "閲覧" }).click();
    await expect.element(page.getByRole("radio", { name: "閲覧" })).toBeChecked();
  });

  it("読み取り専用ではモードを切り替えられない", async () => {
    mount(fileStartup(ok(), { readonly: true }));
    await expect.element(page.getByText("読み取り専用")).toBeVisible();
    expect(document.querySelector(".mode-switch")).toBeNull();
  });

  it("ファイルがまだ無ければ、最初の保存で作ることを知らせる", async () => {
    mount(fileStartup({ status: "missing" }, { editable: true }));
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/growth\.json はまだありません/);
  });

  it("開けなかったファイルは理由を知らせ、多すぎる理由は件数でまとめる", async () => {
    const errors = Array.from({ length: 10 }, (_, index) => `title: 問題${index}`);
    mount(fileStartup({ status: "invalid", revision: "r", errors }));
    await expect
      .element(page.getByRole("alert"))
      .toMatchTextContent(/growth\.json を開けませんでした/);
    expect(notice()?.textContent).toContain("title: 問題6");
    expect(notice()?.textContent).toContain("ほか 3 件");
    await expect.element(page.getByRole("button", { name: /自動保存を停止中/ })).toBeVisible();
  });

  it("保存に失敗したら表示を変え、押すと対処を案内する", async () => {
    const { store, control } = fakeFileStore();
    control.saveResult = { ok: false, reason: "failed", error: new Error("disk full") };
    mount(fileStartup(ok(), { editable: true, store }));
    await userEvent.fill(page.getByRole("textbox", { name: "図のタイトル" }), "新しい題");
    const indicator = page.getByRole("button", { name: /自動保存できません/ });
    await expect.element(indicator).toBeVisible();
    await page.getByRole("button", { name: "閉じる" }).click();
    await indicator.click();
    await expect.element(page.getByRole("alert")).toMatchTextContent(/disk full/);

    control.saveResult = { ok: true };
    await page.getByRole("button", { name: "保存し直す" }).click();
    await expect.element(page.getByText("growth.json", { exact: true })).toBeVisible();
    expect(control.saved.at(-1)?.title).toBe("新しい題");
  });

  it("つながりが切れたら知らせ、見張れなくなったら警告を出す", async () => {
    const { store, control } = fakeFileStore();
    mount(fileStartup(ok(), { store }));
    await expect.element(page.getByText("growth.json", { exact: true })).toBeVisible();

    control.handlers().lost("unwatched", "EMFILE");
    const warning = page.getByRole("button", { name: /変更を見張れません/ });
    await expect.element(warning).toBeVisible();
    await page.getByRole("button", { name: "閉じる" }).click();
    await warning.click();
    await expect.element(page.getByRole("alert")).toMatchTextContent(/EMFILE/);

    control.handlers().lost("disconnected");
    await expect.element(page.getByRole("button", { name: /接続が切れました/ })).toBeVisible();
    control.handlers().restored();
    await expect.element(page.getByRole("button", { name: /変更を見張れません/ })).toBeVisible();
  });

  it("ほかの場所での変更を読み込んだら知らせる", async () => {
    const { store, control } = fakeFileStore();
    mount(fileStartup(ok(), { store }));
    await expect.element(node("売上")).toBeVisible();
    control.reloadResult = { ok: true, diagram: { ...createSampleDiagram(), title: "外で直した" } };
    control.handlers().change();
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/growth\.json の変更を読み込みました/);
    await expect
      .element(page.getByRole("textbox", { name: "図のタイトル" }))
      .toHaveValue("外で直した");
  });
});
