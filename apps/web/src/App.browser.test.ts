import * as edit from "@loopcraft/core/edit";
import { createEmptyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import type { LinkId } from "@loopcraft/core/schema";
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
  inlineLabel,
  page,
  rendered,
  userEvent,
} from "./testing/app.ts";

afterEach(cleanup);

const loopItems = () => document.querySelectorAll("[data-loop-key]");
const ok = (diagram = createSampleDiagram()) => ({
  status: "ok" as const,
  diagram,
  revision: "r",
});

describe("エディタ", () => {
  it("サンプルを開くと、変数とループが並ぶ", async () => {
    mount(browserStartup());
    await expect.element(page.getByRole("heading", { name: /最初の変数を置いて/ })).toBeVisible();
    await page.getByRole("button", { name: "サンプルを開く" }).click();
    await expect.element(node("社員数")).toBeVisible();
    await expect.element(page.getByRole("button", { name: /成長エンジン/ }).first()).toBeVisible();
    expect(loopItems()).toHaveLength(4);
  });

  it("キャンバスをダブルクリックして変数を足し、名前を付ける", async () => {
    mount(browserStartup(createEmptyDiagram()));
    await userEvent.dblClick(canvas(), { position: { x: 400, y: 300 } });
    const input = page.getByRole("textbox", { name: "変数の名前" });
    await expect.element(input).toHaveFocus();
    await userEvent.fill(input, "顧客満足度");
    await userEvent.keyboard("{Enter}");
    await expect.element(node("顧客満足度")).toBeVisible();
  });

  it("変数の幅が変わるほど長い名前でも、入力中の文字を消さずに付けられる", async () => {
    mount(browserStartup(createEmptyDiagram()));
    await userEvent.dblClick(canvas(), { position: { x: 400, y: 300 } });
    const input = page.getByRole("textbox", { name: "変数の名前" });
    await expect.element(input).toHaveFocus();
    const name = "顧客満足度と従業員エンゲージメントの関係";
    await userEvent.fill(input, name);
    await expect.element(input).toHaveValue(name);
    await userEvent.keyboard("{Enter}");
    await expect.element(node(name)).toBeVisible();
  });

  it("変数の右端の点をドラッグして関連を引くと、ループが見つかる", async () => {
    const diagram = edit.removeLinks(createSampleDiagram(), new Set(["l_join" as LinkId]));
    mount(browserStartup(diagram));
    await expect.element(node("採用数")).toBeVisible();
    const before = loopItems().length;
    const handle = document.querySelector('[data-variable-id="hiring"] .connect-handle')!;
    const target = document.querySelector('[data-variable-id="staff"] .body-rect')!;
    await userEvent.dragAndDrop(page.elementLocator(handle), page.elementLocator(target));
    await expect.poll(() => loopItems().length).toBeGreaterThan(before);
    await expect.element(page.getByText("関連", { exact: true })).toBeVisible();
  });

  it("フォーカスした変数を Delete で消す", async () => {
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

    // 変数にフォーカスを残してから入力欄へ移るのは、選択が残っていても入力欄の操作が図に効かないことを確かめるため
    nodeElement("sales").focus();
    const title = page.getByRole("textbox", { name: "図のタイトル" });
    await userEvent.click(title);
    await userEvent.keyboard("{Control>}z{/Control}{Delete}");
    await expect.element(node("離職数")).not.toBeInTheDocument();
    await expect.element(node("売上")).toBeVisible();
  });

  it("Escape で選択を外し、Enter で選んだ変数の名前を編集する", async () => {
    mount(browserStartup(createSampleDiagram()));
    await expect.element(node("売上")).toBeVisible();
    nodeElement("sales").focus();
    await expect.element(page.getByRole("heading", { name: "変数" })).toBeVisible();
    (document.activeElement as HTMLElement).blur();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("textbox", { name: "変数の名前" })).toHaveFocus();
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
    const app = document.querySelector("main")!;
    const transfer = new DataTransfer();
    transfer.items.add(jsonFile(createSampleDiagram()));
    const dropping = async () => {
      await rendered();
      return document.querySelector("[data-dropping]") !== null;
    };
    app.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true }));
    expect(await dropping()).toBe(false);
    app.dispatchEvent(
      new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }),
    );
    expect(await dropping()).toBe(true);
    app.dispatchEvent(new DragEvent("dragleave", { bubbles: true, relatedTarget: app }));
    expect(await dropping()).toBe(true);
    app.dispatchEvent(new DragEvent("dragleave", { bubbles: true }));
    expect(await dropping()).toBe(false);
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
  it("最初から編集でき、読み取り専用のときだけ編集できない", async () => {
    mount(fileStartup(ok()));
    await expect.element(page.getByText("growth.json")).toBeVisible();
    await userEvent.dblClick(canvas(), { position: { x: 300, y: 120 } });
    await expect.element(page.getByRole("textbox", { name: "変数の名前" })).toHaveFocus();

    mount(fileStartup(ok(), { readonly: true }));
    await expect.element(page.getByText("読み取り専用", { exact: true })).toBeVisible();
    // toBeVisible で確かめないのは、読み上げ用の文は画面には出さないため
    await expect
      .element(page.getByText("読み取り専用。編集も保存もできません"))
      .toBeInTheDocument();
    await userEvent.dblClick(canvas(), { position: { x: 300, y: 120 } });
    expect(inlineLabel()).toBeNull();
  });

  it("狭い画面では読み取り専用の印を鍵のアイコンに縮める", async () => {
    const original = { width: window.innerWidth, height: window.innerHeight };
    await page.viewport(390, 800);
    try {
      mount(fileStartup(ok(), { readonly: true }));
      await expect.element(page.getByText("読み取り専用", { exact: true })).not.toBeVisible();
      await expect
        .poll(
          () =>
            document.querySelector('[title^="loopcraft serve"] svg')?.getBoundingClientRect().width,
        )
        .toBeGreaterThan(0);
    } finally {
      await page.viewport(original.width, original.height);
    }
  });

  it("ファイルがまだ無ければ、最初の保存で作ることを知らせる", async () => {
    mount(fileStartup({ status: "missing" }));
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
    mount(fileStartup(ok(), { store }));
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
