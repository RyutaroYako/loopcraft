import { createSampleDiagram } from "@loopcraft/core/sample";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  browserStartup,
  canvasPoint,
  fileStartup,
  centerOf,
  cleanup,
  mount,
  node,
  nodeElement,
  page,
  userEvent,
} from "../testing/app.tsx";

afterEach(cleanup);

const button = (name: string) => page.getByRole("button", { name, exact: true });
const sheet = () => document.querySelector<HTMLElement>(".sidebar")!;
const sheetHeight = () => sheet().getBoundingClientRect().height;

async function atPhoneSize(
  run: () => Promise<void>,
  startup = browserStartup(createSampleDiagram()),
) {
  const original = { width: window.innerWidth, height: window.innerHeight };
  await page.viewport(390, 664);
  try {
    mount(startup);
    await expect.element(node("社員数")).toBeVisible();
    // 測って全体を表示するまで、要素の位置が定まらない
    for (let frame = 0; frame < 3; frame++) {
      await new Promise(requestAnimationFrame);
      flush();
    }
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

const scale = () =>
  Number(
    /scale\(([\d.]+)\)/.exec(
      document.querySelector(".canvas-content")!.getAttribute("transform")!,
    )![1],
  );

function touch(type: string, target: Element, pointerId: number, point: { x: number; y: number }) {
  target.dispatchEvent(
    new PointerEvent(type, {
      pointerId,
      pointerType: "touch",
      bubbles: true,
      button: type === "pointerdown" ? 0 : -1,
      clientX: point.x,
      clientY: point.y,
    }),
  );
  flush();
}

describe("指での操作", () => {
  it("2 本指で広げると拡大し、2 本目の指が乗った変数は選ばず、1 本目の移動は取り消す", async () => {
    await atPhoneSize(async () => {
      const svg = document.querySelector(".canvas-svg")!;
      const profit = nodeElement("profit");
      const start = centerOf(profit);
      const before = scale();

      touch("pointerdown", profit, 1, start);
      touch("pointermove", svg, 1, { x: start.x - 20, y: start.y });
      const other = canvasPoint(40, 40);
      touch("pointerdown", nodeElement("staff"), 2, centerOf(nodeElement("staff")));
      touch("pointermove", svg, 2, other);
      touch("pointermove", svg, 1, { x: start.x + 60, y: start.y + 60 });
      touch("pointerup", svg, 2, other);
      touch("pointerup", svg, 1, start);

      expect(scale()).toBeGreaterThan(before);
      expect(document.querySelector(".node.selected")?.getAttribute("aria-label")).toBe("利益");
      const after = nodeElement("profit");
      expect(after.getAttribute("transform")).toBe(profit.getAttribute("transform"));

      // 指が 1 本に戻ったら、もう拡大縮小しない
      const settled = scale();
      touch("pointerdown", svg, 3, canvasPoint(100, 100));
      touch("pointermove", svg, 3, canvasPoint(160, 160));
      touch("pointerup", svg, 3, canvasPoint(160, 160));
      expect(scale()).toBe(settled);
    });
  });

  it("選んだ変数から、タップした変数や空いた所へ矢印を引く", async () => {
    await atPhoneSize(async () => {
      const links = () => document.querySelectorAll("[data-link-id]").length;
      const before = links();
      await node("利益").click();
      await button("キャンバスで矢印を引く").click();
      await expect.poll(() => sheet().classList.contains("sheet-peek")).toBe(true);
      await expect
        .poll(() => document.querySelector(".connect-banner [role=status]")?.textContent)
        .toMatch(/^「利益」からつなぐ先をタップ/);

      // 変数の端の点に触れても、その変数に触れたのと同じ
      const handle = nodeElement("training").querySelector(".node-handle")!;
      touch("pointerdown", handle, 1, centerOf(handle));
      touch("pointerup", document.querySelector(".canvas-svg")!, 1, centerOf(handle));
      expect(links()).toBe(before + 1);
      await expect.element(page.getByRole("heading", { name: "関連", exact: true })).toBeVisible();
      expect(document.querySelector(".connect-banner")).toBeNull();

      // 押さずにフォーカスで選ぶのは、半分まで上がったシートや下端のボタンが変数に重なるため
      nodeElement("profit").focus();
      await button("キャンバスで矢印を引く").click();
      const empty = canvasPoint(30, 30);
      const svg = document.querySelector(".canvas-svg")!;
      touch("pointerdown", svg, 2, empty);
      touch("pointerup", svg, 2, empty);
      expect(links()).toBe(before + 2);
      await expect.element(page.getByRole("textbox", { name: "変数の名前" })).toHaveFocus();
    });
  });

  it("つなぐのは、やめる・Escape・元の変数をもう一度押す・元の変数が消える、で取りやめる", async () => {
    await atPhoneSize(async () => {
      const links = () => document.querySelectorAll("[data-link-id]").length;
      const before = links();
      const banner = () => document.querySelector(".connect-banner");
      const start = async () => {
        await node("利益").click();
        await button("キャンバスで矢印を引く").click();
        await expect.poll(banner).not.toBeNull();
      };

      await start();
      await button("やめる").click();
      expect(banner()).toBeNull();

      await start();
      await userEvent.keyboard("{Escape}");
      expect(banner()).toBeNull();

      await start();
      const profit = nodeElement("profit");
      touch("pointerdown", profit, 1, centerOf(profit));
      touch("pointerup", document.querySelector(".canvas-svg")!, 1, centerOf(profit));
      expect(banner()).toBeNull();

      await start();
      await userEvent.keyboard("{Delete}");
      await expect.poll(banner).toBeNull();
      expect(links()).toBeLessThan(before);
    });
  });
});

describe("メニュー", () => {
  const dialog = (name: string) => page.getByRole("dialog", { name });
  // 前方一致にするのは、項目名に続く補足も名前に含めて読み上げるため
  const menuItem = (name: string) =>
    dialog("メニュー").getByRole("button", { name: new RegExp(`^${name}`) });

  it("ツールバーから外したファイル操作を、メニューから選ぶ", async () => {
    await atPhoneSize(async () => {
      await expect.element(page.getByRole("button", { name: "新規" })).not.toBeInTheDocument();

      await button("メニュー").click();
      await menuItem("整列").click();
      await expect.element(dialog("メニュー")).not.toBeInTheDocument();
      await expect.element(button("元に戻す")).not.toBeDisabled();

      await button("メニュー").click();
      await menuItem("新規").click();
      await expect.poll(() => document.querySelectorAll("[data-variable-id]").length).toBe(0);
      await button("元に戻す").click();

      for (const [item, title] of [
        ["読み込み", "JSON を読み込む"],
        ["画像", "画像として書き出す"],
        ["JSON を書き出す", "JSON を書き出す"],
      ] as const) {
        await button("メニュー").click();
        await menuItem(item).click();
        await expect.element(dialog(title)).toBeVisible();
        await expect.element(dialog("メニュー")).not.toBeInTheDocument();
        await dialog(title).getByRole("button", { name: "閉じる" }).click();
        await expect.element(dialog(title)).not.toBeInTheDocument();
      }
    });
  });

  it("読み取り専用では、編集する項目を出さない", async () => {
    await atPhoneSize(
      async () => {
        await button("メニュー").click();
        await expect.element(menuItem("画像")).toBeVisible();
        await expect.element(menuItem("整列")).not.toBeInTheDocument();
        await expect.element(menuItem("読み込み")).not.toBeInTheDocument();
        await expect.element(button("変数を追加")).not.toBeInTheDocument();
      },
      fileStartup(
        { status: "ok", revision: "r", diagram: createSampleDiagram() },
        { readonly: true },
      ),
    );
  });
});
