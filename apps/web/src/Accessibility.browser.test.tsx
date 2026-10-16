import { createSampleDiagram } from "@loopcraft/core/sample";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  browserStartup,
  cleanup,
  fileStartup,
  mount,
  node,
  nodeElement,
  page,
} from "./testing/app.tsx";

afterEach(cleanup);

async function violations() {
  const result = await axe.run(document, {
    // 色のコントラストを外すのは、アニメーションの途中の色で判定がぶれるため。トークンを決めるときに別に確かめる
    rules: { "color-contrast": { enabled: false } },
  });
  return result.violations.map((violation) => ({
    id: violation.id,
    targets: violation.nodes.map((target) => target.target.join(" ")),
  }));
}

describe("アクセシビリティ", () => {
  it("空の図", async () => {
    mount(browserStartup());
    await expect.element(page.getByRole("button", { name: "サンプルを開く" })).toBeVisible();
    expect(await violations()).toEqual([]);
  });

  it("変数・関連・ループを選んだとき", async () => {
    mount(browserStartup(createSampleDiagram()));
    nodeElement("sales").focus();
    await expect.element(page.getByRole("heading", { name: "変数" })).toBeVisible();
    expect(await violations()).toEqual([]);

    (
      page.getByRole("button", { name: /^社員数から売上への関連/ }).element() as SVGGElement
    ).focus();
    await expect.element(page.getByRole("heading", { name: "関連" })).toBeVisible();
    expect(await violations()).toEqual([]);

    await page
      .getByRole("button", { name: /成長エンジン/ })
      .first()
      .click();
    await expect.element(page.getByRole("heading", { name: "自己強化ループ" })).toBeVisible();
    expect(await violations()).toEqual([]);
  });

  it("変数の一覧と右クリックメニュー", async () => {
    mount(browserStartup(createSampleDiagram()));
    await page.getByRole("tab", { name: /変数/ }).click();
    expect(await violations()).toEqual([]);

    await node("社員数").click({ button: "right" });
    await expect.element(page.getByRole("menu")).toBeVisible();
    expect(await violations()).toEqual([]);
  });

  it("ダイアログ", async () => {
    mount(browserStartup(createSampleDiagram()));
    await page.getByRole("button", { name: "JSON を書き出す" }).click();
    await expect.element(page.getByRole("dialog")).toBeVisible();
    expect(await violations()).toEqual([]);
  });

  it("狭い画面", async () => {
    const original = { width: window.innerWidth, height: window.innerHeight };
    await page.viewport(390, 844);
    try {
      mount(browserStartup(createSampleDiagram()));
      await expect.element(node("社員数")).toBeVisible();
      expect(await violations()).toEqual([]);

      await page.getByRole("button", { name: "メニュー" }).click();
      await expect.element(page.getByRole("dialog")).toBeVisible();
      expect(await violations()).toEqual([]);
    } finally {
      await page.viewport(original.width, original.height);
    }
  });

  it("読み取り専用", async () => {
    mount(
      fileStartup(
        { status: "ok", diagram: createSampleDiagram(), revision: "r" },
        { readonly: true },
      ),
    );
    await expect.element(node("社員数")).toBeVisible();
    expect(await violations()).toEqual([]);
  });
});
