import { createSampleDiagram } from "@loopcraft/core/sample";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { browserStartup, cleanup, mount, node, page } from "../testing/app.tsx";

afterEach(cleanup);

const button = (name: string) => page.getByRole("button", { name, exact: true });
const sheet = () => document.querySelector<HTMLElement>(".sidebar")!;
const sheetHeight = () => sheet().getBoundingClientRect().height;

async function atPhoneSize(run: () => Promise<void>) {
  const original = { width: window.innerWidth, height: window.innerHeight };
  await page.viewport(390, 664);
  try {
    mount(browserStartup(createSampleDiagram()));
    await expect.element(node("社員数")).toBeVisible();
    await run();
  } finally {
    await page.viewport(original.width, original.height);
  }
}

function dragHandle(dy: number) {
  const handle = document.querySelector(".sheet-handle")!;
  const rect = handle.getBoundingClientRect();
  const init = { pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true };
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  handle.dispatchEvent(
    new PointerEvent("pointerdown", { ...init, button: 0, clientX: x, clientY: y }),
  );
  handle.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: x, clientY: y + dy }));
  flush();
  const during = sheetHeight();
  handle.dispatchEvent(new PointerEvent("pointerup", { ...init, clientX: x, clientY: y + dy }));
  // 実際の指の操作と同じく、離した後に click が届く
  handle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  flush();
  return during;
}

describe("狭い画面", () => {
  it("ページをスクロールさせず、シートを取っ手で広げて畳む", async () => {
    await atPhoneSize(async () => {
      expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(window.innerHeight);
      const peek = sheetHeight();
      await button("パネルを広げる").click();
      await expect.poll(sheetHeight).toBeGreaterThan(peek + 100);
      await button("パネルを広げる").click();
      await expect.element(button("パネルを畳む")).toBeVisible();
      await button("パネルを畳む").click();
      await expect.poll(sheetHeight).toBe(peek);
    });
  });

  it("取っ手を引いた分だけ追い、離すと一段ずつ止まる", async () => {
    await atPhoneSize(async () => {
      const peek = sheetHeight();
      expect(dragHandle(-20)).toBe(peek + 20);
      await expect.poll(sheetHeight).toBe(peek);
      expect(sheet().classList.contains("sheet-peek")).toBe(true);

      dragHandle(-120);
      await expect.poll(() => sheet().classList.contains("sheet-half")).toBe(true);
      dragHandle(80);
      await expect.poll(() => sheet().classList.contains("sheet-peek")).toBe(true);
    });
  });

  it("変数を選ぶとシートが上がり、編集欄を一覧より先に見せる", async () => {
    await atPhoneSize(async () => {
      await node("社員数").click();
      await expect.poll(() => sheet().classList.contains("sheet-half")).toBe(true);
      const name = page.getByRole("textbox", { name: "名前", exact: true });
      await expect.element(name).toBeVisible();
      const tabs = document.querySelector(".browser-tabs")!;
      expect(name.element().getBoundingClientRect().top).toBeLessThan(
        tabs.getBoundingClientRect().top,
      );
    });
  });

  it("下端のボタンで画面の中央に変数を足し、元に戻せる", async () => {
    await atPhoneSize(async () => {
      const count = () => document.querySelectorAll("[data-variable-id]").length;
      const before = count();
      await button("変数を追加").click();
      await expect.poll(count).toBe(before + 1);
      await expect.element(page.getByRole("textbox", { name: "変数の名前" })).toHaveFocus();
      await button("元に戻す").click();
      await expect.poll(count).toBe(before);
      await expect.element(button("やり直す")).not.toBeDisabled();
    });
  });
});
