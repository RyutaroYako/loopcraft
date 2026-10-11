import { createEmptyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  browserStartup,
  captureDownloads,
  chooseFile,
  cleanup,
  fileStartup,
  jsonFile,
  mount,
  node,
  page,
  userEvent,
} from "../testing/app.tsx";

afterEach(cleanup);

const title = () => page.getByRole("textbox", { name: "図のタイトル" });
const button = (name: string) => page.getByRole("button", { name, exact: true });

/** IME で変換中の入力と、その確定を送る */
function compose(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value;
  input.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
  input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
}

describe("ツールバー", () => {
  it("タイトルを書き換え、変換中は確定するまで反映しない", async () => {
    mount(browserStartup(createSampleDiagram()));
    await userEvent.fill(title(), "新しい題");
    await expect.element(title()).toHaveValue("新しい題");
    await expect.element(button("元に戻す")).not.toBeDisabled();
    await button("元に戻す").click();
    await expect.element(title()).toHaveValue("組織の成長と人の負荷");
    await button("やり直す").click();
    await expect.element(title()).toHaveValue("新しい題");

    const input = title().element() as HTMLInputElement;
    input.value = "へんかん";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
    await button("元に戻す").click();
    await expect.element(title()).toHaveValue("組織の成長と人の負荷");
    compose(input, "変換");
    await expect.element(title()).toHaveValue("変換");
    await button("元に戻す").click();
    await expect.element(title()).toHaveValue("組織の成長と人の負荷");
  });

  it("新規で空の図にし、元に戻せる", async () => {
    mount(browserStartup(createSampleDiagram()));
    await expect.element(node("社員数")).toBeVisible();
    await button("新規").click();
    await expect.element(node("社員数")).not.toBeInTheDocument();
    await button("元に戻す").click();
    await expect.element(node("社員数")).toBeVisible();
  });

  it("JSON を読み込み、選ばずに閉じたら何もしない", async () => {
    mount(browserStartup(createEmptyDiagram()));
    chooseFile(undefined);
    await button("読み込み").click();
    await expect.element(page.getByRole("heading", { name: /最初の出来事を置いて/ })).toBeVisible();
    chooseFile(jsonFile(createSampleDiagram(), "growth.json"));
    await button("読み込み").click();
    await expect.element(node("社員数")).toBeVisible();
  });

  it("JSON を書き出す", async () => {
    const downloads = captureDownloads();
    try {
      mount(browserStartup({ ...createSampleDiagram(), title: "a/b" }));
      await button("JSON を書き出す").click();
      expect(downloads.files).toEqual(["a_b.json"]);
    } finally {
      downloads.restore();
    }
  });
});

describe("最初の画面", () => {
  it("出来事を追加し、JSON を読み込める", async () => {
    mount(browserStartup(createEmptyDiagram()));
    await button("出来事を追加").click();
    await expect.element(page.getByRole("textbox", { name: "出来事の名前" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");

    mount(browserStartup(createEmptyDiagram()));
    chooseFile(undefined);
    await button("JSON を読み込む").click();
    chooseFile(jsonFile(createSampleDiagram()));
    await button("JSON を読み込む").click();
    await expect.element(node("社員数")).toBeVisible();
  });

  it("閲覧モードでは編集に切り替えるよう案内する", async () => {
    mount(fileStartup({ status: "ok", diagram: createEmptyDiagram(), revision: "r" }));
    await expect
      .element(page.getByRole("heading", { name: "まだ出来事がありません" }))
      .toBeVisible();
    await expect.element(button("全体を表示")).toBeDisabled();
  });
});

describe("入力欄", () => {
  it("検査パネルと出来事の名前も、変換中は確定するまで反映しない", async () => {
    mount(browserStartup(createSampleDiagram()));
    await expect.element(node("売上")).toBeVisible();
    const description = page.getByRole("textbox", { name: /^この図で伝えたいこと/ });
    compose(description.element() as HTMLTextAreaElement, "成長");
    await expect.element(description).toHaveValue("成長");

    (node("売上").element() as SVGGElement).focus();
    const label = page.getByRole("textbox", { name: "名前", exact: true });
    await expect.element(label).toBeVisible();
    compose(label.element() as HTMLInputElement, "売上高");
    await expect.element(node("売上高")).toBeVisible();

    await userEvent.keyboard("{F2}");
    const inline = page.getByRole("textbox", { name: "出来事の名前" });
    await expect.element(inline).toHaveFocus();
    const element = inline.element() as HTMLInputElement;
    element.value = "へんかん";
    element.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
    // 変換を確定する Enter では閉じない
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }),
    );
    await expect.element(inline).toHaveFocus();
    compose(element, "収益");
    await userEvent.keyboard("{Enter}");
    await expect.element(node("収益")).toBeVisible();
  });
});
