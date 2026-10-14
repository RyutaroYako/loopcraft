import { createEmptyDiagram, stringifyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  browserStartup,
  captureDownloads,
  chooseFile,
  cleanup,
  fileStartup,
  jsonFile,
  mount,
  node,
  notice,
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

  it("整列で変数を並べ直し、元に戻せる", async () => {
    mount(browserStartup(createSampleDiagram()));
    const transform = () => node("社員数").element().getAttribute("transform");
    const before = transform();
    await button("整列").click();
    await expect.poll(transform).not.toBe(before);
    await button("元に戻す").click();
    await expect.poll(transform).toBe(before);

    mount(browserStartup(createEmptyDiagram()));
    await expect.element(button("整列")).toBeDisabled();
    mount(
      fileStartup(
        { status: "ok", diagram: createSampleDiagram(), revision: "r" },
        { readonly: true },
      ),
    );
    await expect.element(button("整列")).not.toBeInTheDocument();
  });

  it("画像と JSON の書き出しは読み取り専用でも使え、図が空なら画像は作れない", async () => {
    mount(
      fileStartup(
        { status: "ok", diagram: createSampleDiagram(), revision: "r" },
        { readonly: true },
      ),
    );
    await expect.element(button("画像")).toBeEnabled();
    await expect.element(button("JSON を書き出す")).toBeEnabled();
    await expect.element(button("読み込み")).not.toBeInTheDocument();
    mount(browserStartup(createEmptyDiagram()));
    await expect.element(button("画像")).toBeDisabled();
  });
});

describe("JSON の読み込み", () => {
  const dialog = () => page.getByRole("dialog", { name: "JSON を読み込む" });
  const textarea = () => dialog().getByRole("textbox");

  it("貼り付けた JSON を読み込み、誤りがあればダイアログに出す", async () => {
    mount(browserStartup(createEmptyDiagram()));
    await button("読み込み").click();
    await expect.element(textarea()).toHaveFocus();
    await expect.element(button("読み込む")).toBeDisabled();
    await userEvent.fill(textarea(), '{"version": 1}');
    await button("読み込む").click();
    await expect.element(dialog().getByRole("alert")).toBeVisible();
    expect(dialog().getByRole("alert").element().textContent).toContain("title: 無効な型");
    // 書き直したら誤りの表示は消える
    await userEvent.fill(textarea(), JSON.stringify(createSampleDiagram()));
    await expect.element(dialog().getByRole("alert")).not.toBeInTheDocument();
    await button("読み込む").click();
    await expect.element(dialog()).not.toBeInTheDocument();
    await expect.element(node("社員数")).toBeVisible();
    expect(notice()?.textContent).toContain("JSON を読み込みました");
  });

  it("ファイルからも選べ、選ばなければダイアログに戻る", async () => {
    mount(browserStartup(createEmptyDiagram()));
    await button("読み込み").click();
    chooseFile(undefined);
    await button("ファイルから選ぶ").click();
    await expect.element(dialog()).toBeVisible();
    chooseFile(jsonFile(createSampleDiagram(), "growth.json"));
    await button("ファイルから選ぶ").click();
    await expect.element(dialog()).not.toBeInTheDocument();
    await expect.element(node("社員数")).toBeVisible();
  });

  it("キャンセルや背景のクリックで閉じ、開いている間は図のショートカットが効かない", async () => {
    mount(browserStartup(createSampleDiagram()));
    (node("社員数").element() as SVGGElement).focus();
    await button("読み込み").click();
    await button("キャンセル").click();
    await expect.element(dialog()).not.toBeInTheDocument();

    await button("読み込み").click();
    await userEvent.keyboard("{Control>}z{/Control}");
    (dialog().element() as HTMLDialogElement).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
    );
    await expect.element(node("社員数")).toBeVisible();
    // 枠の外（背景）のクリックは dialog 要素そのものに当たる
    (dialog().element() as HTMLDialogElement).click();
    await expect.element(dialog()).not.toBeInTheDocument();
    await expect.element(node("社員数")).toBeVisible();
  });
});

describe("JSON の書き出し", () => {
  const dialog = () => page.getByRole("dialog", { name: "JSON を書き出す" });

  it("JSON を表示してコピーでき、ファイルにも保存できる", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const downloads = captureDownloads();
    try {
      const diagram = { ...createSampleDiagram(), title: "a/b" };
      mount(browserStartup(diagram));
      await button("JSON を書き出す").click();
      const text = dialog().getByRole("textbox");
      await expect.element(text).toHaveValue(stringifyDiagram(diagram));
      await button("コピー").click();
      await expect.element(button("コピーしました")).toBeVisible();
      expect(writeText).toHaveBeenCalledWith(stringifyDiagram(diagram));
      await button("ファイルに保存").click();
      expect(downloads.files).toEqual(["a_b.json"]);
    } finally {
      downloads.restore();
    }
  });

  it("コピーできなければボタンで伝える", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    mount(browserStartup(createSampleDiagram()));
    await button("JSON を書き出す").click();
    await button("コピー").click();
    await expect.element(button("コピーできませんでした")).toBeVisible();
  });
});

describe("画像の書き出し", () => {
  const dialog = () => page.getByRole("dialog", { name: "画像として書き出す" });

  it("選択を外して図全体を写し、コピーや PNG の保存ができる", async () => {
    const write = vi.spyOn(navigator.clipboard, "write").mockResolvedValue();
    const downloads = captureDownloads();
    try {
      mount(browserStartup({ ...createSampleDiagram(), title: "成長" }));
      (node("社員数").element() as SVGGElement).focus();
      await button("画像").click();
      const image = dialog().getByRole("img", { name: "成長 の画像" });
      await expect.element(image).toBeVisible();
      expect(document.querySelector(".node.selected")).toBeNull();
      const { naturalWidth, naturalHeight } = image.element() as HTMLImageElement;
      const box = document.querySelector<SVGGElement>(".canvas-content")!.getBBox();
      // 余白を付けて、表示の倍率にかかわらず等倍の 2 倍の解像度で写す
      expect(naturalWidth).toBe(Math.ceil(box.width + 64) * 2);
      expect(naturalHeight).toBe(Math.ceil(box.height + 64) * 2);

      await button("コピー").click();
      await expect.element(button("コピーしました")).toBeVisible();
      const item = write.mock.calls[0]![0][0]!;
      expect(item.types).toEqual(["image/png"]);
      await button("PNG を保存").click();
      expect(downloads.files).toEqual(["成長.png"]);
    } finally {
      downloads.restore();
    }
  });

  it("写せなければダイアログで伝える", async () => {
    vi.spyOn(SVGGraphicsElement.prototype, "getBBox").mockImplementation(() => {
      throw new Error("測れません");
    });
    mount(browserStartup(createSampleDiagram()));
    await button("画像").click();
    await expect.element(dialog().getByRole("alert")).toBeVisible();
    expect(dialog().getByRole("alert").element().textContent).toBe(
      "画像を作れませんでした測れません",
    );
    await expect.element(button("PNG を保存")).toBeDisabled();
  });
});

describe("最初の画面", () => {
  it("変数を追加し、JSON を読み込める", async () => {
    mount(browserStartup(createEmptyDiagram()));
    await button("変数を追加").click();
    await expect.element(page.getByRole("textbox", { name: "変数の名前" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");

    mount(browserStartup(createEmptyDiagram()));
    chooseFile(undefined);
    await button("JSON を読み込む").click();
    chooseFile(jsonFile(createSampleDiagram()));
    await button("JSON を読み込む").click();
    await expect.element(node("社員数")).toBeVisible();
  });

  it("読み取り専用で図が空なら、その旨を示す", async () => {
    mount(
      fileStartup(
        { status: "ok", diagram: createEmptyDiagram(), revision: "r" },
        { readonly: true },
      ),
    );
    await expect.element(page.getByRole("heading", { name: "まだ変数がありません" })).toBeVisible();
    await expect.element(button("全体を表示")).toBeDisabled();
  });
});

describe("入力欄", () => {
  it("検査パネルと変数の名前も、変換中は確定するまで反映しない", async () => {
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
    const inline = page.getByRole("textbox", { name: "変数の名前" });
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
