import { createSampleDiagram } from "@loopcraft/core/sample";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  browserStartup,
  canvasPoint,
  centerOf,
  cleanup,
  expandButton,
  fileStartup,
  mount,
  node,
  nodeElement,
  canvasSvg,
  inlineLabel,
  page,
  rendered,
  userEvent,
} from "./testing/app.ts";

afterEach(cleanup);

const button = (name: string) => page.getByRole("button", { name, exact: true });
const sheet = () => document.querySelector<HTMLElement>("aside")!;
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
    // すぐに操作しないのは、測って全体を表示するまで要素の位置が定まらないため
    for (let frame = 0; frame < 3; frame++) {
      await new Promise(requestAnimationFrame);
      await rendered();
    }
    await run();
  } finally {
    await page.viewport(original.width, original.height);
  }
}

async function dragHandle(
  dy: number,
  options: { click?: boolean; button?: number; end?: "pointerup" | "pointercancel" } = {},
) {
  const handle = document.querySelector('aside button[aria-label^="パネルを"]')!;
  const rect = handle.getBoundingClientRect();
  const init = { pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true };
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  handle.dispatchEvent(
    new PointerEvent("pointerdown", {
      ...init,
      button: options.button ?? 0,
      clientX: x,
      clientY: y,
    }),
  );
  handle.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: x, clientY: y + dy }));
  await rendered();
  const during = sheetHeight();
  handle.dispatchEvent(
    new PointerEvent(options.end ?? "pointerup", { ...init, clientX: x, clientY: y + dy }),
  );
  // マウスでは離した後に click が届き、指で動かしたときは届かない
  if (options.click ?? true) {
    handle.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  }
  await rendered();
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

      // キーボードでも一段ずつ送る
      (document.querySelector('aside button[aria-label^="パネルを"]') as HTMLElement).focus();
      await userEvent.keyboard("{Enter}");
      await expect.poll(() => sheet().dataset.sheetSize).toBe("half");
    });
  });

  it("取っ手を引いた分だけ追い、離した高さに近い段で止まる", async () => {
    await atPhoneSize(async () => {
      const peek = sheetHeight();
      expect(await dragHandle(-20)).toBe(peek + 20);
      await expect.poll(sheetHeight).toBe(peek);
      expect(sheet().dataset.sheetSize).toBe("peek");

      await dragHandle(-120);
      await expect.poll(() => sheet().dataset.sheetSize).toBe("half");
      await dragHandle(60);
      await expect.poll(() => sheet().dataset.sheetSize).toBe("half");
      await dragHandle(150);
      await expect.poll(() => sheet().dataset.sheetSize).toBe("peek");

      // 取り消されたときや、左ボタン以外では高さを変えない
      await dragHandle(-120, { end: "pointercancel", click: false });
      await expect.poll(sheetHeight).toBe(peek);
      await dragHandle(-120, { button: 2, click: false });
      expect(sheet().dataset.sheetSize).toBe("peek");

      // 上端近くまで引けば、途中で止まらず全体まで広げる
      await dragHandle(-(window.innerHeight - 220));
      await expect.poll(() => sheet().dataset.sheetSize).toBe("full");

      // click の届かない指のドラッグの後でも、次のタップで切り替わる
      await dragHandle(window.innerHeight, { click: false });
      await expect.poll(() => sheet().dataset.sheetSize).toBe("peek");
      await button("パネルを広げる").click();
      await expect.poll(() => sheet().dataset.sheetSize).toBe("half");
    });
  });

  it("変数を選んでもシートは畳んだまま、上端で削除し、詳しく見られる", async () => {
    await atPhoneSize(async () => {
      const remove = () => button("変数を削除");
      await node("社員数").click();
      await expect.element(remove()).toBeVisible();
      expect(sheet().dataset.sheetSize).toBe("peek");
      expect(
        document.querySelector('section[aria-label="選択中の項目の操作"] h2')?.textContent,
      ).toBe("社員数");

      await button("詳しく").click();
      await expect.poll(() => sheet().dataset.sheetSize).toBe("half");
      await expect.element(remove()).toBeVisible();
      await expect.poll(() => expandButton()).toBeUndefined();
      const name = page.getByRole("textbox", { name: "名前", exact: true });
      await expect.element(name).toBeVisible();
      const tabs = document.querySelector("[role=tablist]")!;
      expect(name.element().getBoundingClientRect().top).toBeLessThan(
        tabs.getBoundingClientRect().top,
      );

      await button("パネルを広げる").click();
      await button("パネルを畳む").click();
      await expect.poll(() => sheet().dataset.sheetSize).toBe("peek");
      await remove().click();
      await expect.element(node("社員数")).not.toBeInTheDocument();
    });
  });

  it("指の素早い 2 回のタップでは、変数を足したり名前の入力を開いたりしない", async () => {
    await atPhoneSize(async () => {
      const count = () => document.querySelectorAll("[data-variable-id]").length;
      const before = count();
      const svg = canvasSvg();
      const empty = canvasPoint(30, 30);
      const tap = (target: Element, point: { x: number; y: number }) => {
        const init = { pointerId: 9, pointerType: "touch", isPrimary: true, bubbles: true };
        target.dispatchEvent(
          new PointerEvent("pointerdown", { ...init, clientX: point.x, clientY: point.y }),
        );
        svg.dispatchEvent(
          new PointerEvent("pointerup", { ...init, clientX: point.x, clientY: point.y }),
        );
      };
      tap(document.querySelector('[data-layer="grid"]')!, empty);
      svg.dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true, clientX: empty.x, clientY: empty.y }),
      );
      await rendered();
      expect(count()).toBe(before);

      const staff = nodeElement("staff");
      tap(staff, centerOf(staff));
      svg.dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true, ...clientOf(centerOf(staff)) }),
      );
      await rendered();
      expect(inlineLabel()).toBeNull();
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
      document.querySelector('[data-layer="content"]')!.getAttribute("transform")!,
    )![1],
  );

async function touch(
  type: string,
  target: Element,
  pointerId: number,
  point: { x: number; y: number },
) {
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
  await rendered();
}

describe("指での操作", () => {
  it("2 本指で広げると拡大し、2 本目の指が乗った変数は選ばず、1 本目の移動は取り消す", async () => {
    await atPhoneSize(async () => {
      const svg = canvasSvg();
      const profit = nodeElement("profit");
      const start = centerOf(profit);
      const before = scale();

      await touch("pointerdown", profit, 1, start);
      await touch("pointermove", svg, 1, { x: start.x - 20, y: start.y });
      const other = canvasPoint(40, 40);
      await touch("pointerdown", nodeElement("staff"), 2, centerOf(nodeElement("staff")));
      await touch("pointermove", svg, 2, other);
      await touch("pointermove", svg, 1, { x: start.x + 60, y: start.y + 60 });
      await touch("pointerup", svg, 2, other);
      await touch("pointerup", svg, 1, start);

      expect(scale()).toBeGreaterThan(before);
      expect(document.querySelector(".canvas-node.selected")?.getAttribute("aria-label")).toBe(
        "利益",
      );
      const after = nodeElement("profit");
      expect(after.getAttribute("transform")).toBe(profit.getAttribute("transform"));

      // 指が 1 本に戻ったら、もう拡大縮小しない
      const settled = scale();
      await touch("pointerdown", svg, 3, canvasPoint(100, 100));
      await touch("pointermove", svg, 3, canvasPoint(160, 160));
      await touch("pointerup", svg, 3, canvasPoint(160, 160));
      expect(scale()).toBe(settled);
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

  it("テーマを切り替えても、メニューは開いたままにする", async () => {
    await atPhoneSize(async () => {
      await expect.element(page.getByRole("button", { name: /^テーマ/ })).not.toBeInTheDocument();
      await button("メニュー").click();
      const theme = dialog("メニュー").getByRole("radiogroup", { name: "テーマ" });
      await expect.element(theme.getByRole("radio", { name: "システム" })).toBeChecked();
      await theme.getByRole("radio", { name: "ダーク" }).click();
      await expect.element(theme.getByRole("radio", { name: "ダーク" })).toBeChecked();
      await expect.element(theme.getByRole("radio", { name: "システム" })).not.toBeChecked();
      expect(document.documentElement.dataset.theme).toBe("dark");
      await expect.element(dialog("メニュー")).toBeVisible();
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
        await userEvent.keyboard("{Escape}");
        nodeElement("sales").focus();
        await expect.element(button("詳しく")).toBeVisible();
        await expect.element(button("変数を削除")).not.toBeInTheDocument();
      },
      fileStartup(
        { status: "ok", revision: "r", diagram: createSampleDiagram() },
        { readonly: true },
      ),
    );
  });
});

describe("指での操作の取り違え", () => {
  it("2 本指の 1 本目が乗った変数は選ばず、3 本目の指も無視して倍率を跳ばさない", async () => {
    await atPhoneSize(async () => {
      const svg = canvasSvg();
      const profit = nodeElement("profit");
      const a = centerOf(profit);
      const b = canvasPoint(40, 40);
      await touch("pointerdown", profit, 1, a);
      await touch("pointerdown", svg, 2, b);
      expect(document.querySelector(".canvas-node.selected")).toBeNull();

      const staff = nodeElement("staff");
      await touch("pointerdown", staff, 3, centerOf(staff));
      expect(document.querySelector(".canvas-node.selected")).toBeNull();
      const before = scale();
      // 1 本目を離しても、残った 2 本で測り直すので倍率は変わらない
      await touch("pointerup", svg, 1, a);
      await touch("pointermove", svg, 2, b);
      expect(scale()).toBe(before);
      await touch("pointerup", svg, 2, b);
      await touch("pointerup", svg, 3, centerOf(staff));
      expect(sheet().dataset.sheetSize).toBe("peek");
    });
  });
});

function clientOf(point: { x: number; y: number }) {
  return { clientX: point.x, clientY: point.y };
}
