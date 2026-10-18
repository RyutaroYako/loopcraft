import { createEmptyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import type { Diagram } from "@loopcraft/core/schema";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  browserStartup,
  canvas,
  canvasPoint,
  centerOf,
  cleanup,
  dragFrom,
  mount,
  node,
  nodeElement,
  inspector,
  canvasSvg,
  inlineLabel,
  page,
  rendered,
  userEvent,
} from "../testing/app.ts";

afterEach(cleanup);

async function open(diagram: Diagram = createSampleDiagram()) {
  mount(browserStartup(diagram));
  // mount 直後に操作しないのは、大きさを測って全体を表示するまで要素の位置が定まらないため
  await settle();
}

async function settle() {
  for (let frame = 0; frame < 3; frame++) {
    await new Promise(requestAnimationFrame);
    await rendered();
  }
}

const heading = (name: string) => page.getByRole("heading", { name, exact: true });
const zoomValue = () =>
  document.querySelector('[role=toolbar][aria-label="表示倍率"]')!.textContent;
const offset = (point: { x: number; y: number }, dx: number, dy: number) => ({
  x: point.x + dx,
  y: point.y + dy,
});
const press = (target: Element, point: { x: number; y: number }, options = {}) =>
  target.dispatchEvent(
    new PointerEvent("pointerdown", {
      pointerId: 1,
      bubbles: true,
      button: 0,
      clientX: point.x,
      clientY: point.y,
      ...options,
    }),
  );
const release = (point: { x: number; y: number }) =>
  canvasSvg().dispatchEvent(
    new PointerEvent("pointerup", {
      pointerId: 1,
      bubbles: true,
      clientX: point.x,
      clientY: point.y,
    }),
  );

describe("ポインタでの操作", () => {
  it("背景をドラッグすると全体が動き、動かさずに離すと選択を外す", async () => {
    await open();
    const sales = centerOf(nodeElement("sales"));
    press(nodeElement("sales"), sales);
    release(sales);
    await expect.element(heading("変数")).toBeVisible();
    await settle();
    const before = centerOf(nodeElement("sales"));
    const background = document.querySelector('[data-layer="grid"]')!;
    await dragFrom(background, canvasPoint(40, 40), canvasPoint(140, 110));
    await rendered();
    const after = centerOf(nodeElement("sales"));
    expect(Math.round(after.x - before.x)).toBe(100);
    expect(Math.round(after.y - before.y)).toBe(70);
    await expect.element(heading("変数")).toBeVisible();

    press(background, canvasPoint(40, 40));
    release(canvasPoint(41, 40));
    await expect.element(heading("図の概要")).toBeVisible();
  });

  it("変数をドラッグで動かし、中断したら元に戻す", async () => {
    await open();
    const target = nodeElement("profit");
    const start = centerOf(target);
    await dragFrom(target.querySelector(".body-rect")!, start, offset(start, 80, 40));
    await rendered();
    expect(Math.round(centerOf(nodeElement("profit")).x - start.x)).toBe(80);

    const moved = centerOf(nodeElement("profit"));
    await dragFrom(
      nodeElement("profit").querySelector(".body-rect")!,
      moved,
      offset(moved, 60, 0),
      {
        end: "pointercancel",
      },
    );
    await rendered();
    expect(Math.round(centerOf(nodeElement("profit")).x - moved.x)).toBe(0);

    await userEvent.keyboard("{Control>}z{/Control}");
    expect(Math.round(centerOf(nodeElement("profit")).x - start.x)).toBe(0);
  });

  it("左ボタン以外や、ドラッグ中の 2 本目のポインタは無視する", async () => {
    await open();
    const target = nodeElement("profit");
    const start = centerOf(target);
    press(target, start, { button: 2 });
    release(offset(start, 80, 0));
    await rendered();
    expect(Math.round(centerOf(nodeElement("profit")).x - start.x)).toBe(0);

    press(target, start);
    press(nodeElement("sales"), centerOf(nodeElement("sales")), { pointerId: 2 });
    const svg = canvasSvg();
    svg.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 2, bubbles: true, clientX: 0, clientY: 0 }),
    );
    svg.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        bubbles: true,
        clientX: start.x + 30,
        clientY: start.y,
      }),
    );
    release(offset(start, 30, 0));
    await rendered();
    expect(Math.round(centerOf(nodeElement("profit")).x - start.x)).toBe(30);
  });

  it("右端の点を引いて、別の変数で離すと関連ができ、何もない所では何も足さない", async () => {
    await open(createEmptyDiagram());
    await userEvent.dblClick(canvas(), { position: { x: 300, y: 300 } });
    await userEvent.keyboard("原因{Enter}");
    await userEvent.dblClick(canvas(), { position: { x: 700, y: 300 } });
    await userEvent.keyboard("結果{Enter}");
    await expect.element(node("結果")).toBeVisible();
    const [from, to] = [...document.querySelectorAll<SVGGElement>(".canvas-node")];
    const handle = from!.querySelector(".connect-handle")!;
    const start = centerOf(handle);

    await dragFrom(handle, start, centerOf(from!));
    await dragFrom(handle, start, offset(start, 20, 0));
    expect(document.querySelectorAll(".canvas-link")).toHaveLength(0);

    press(handle, start);
    const svg = canvasSvg();
    const target = centerOf(to!);
    svg.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        bubbles: true,
        clientX: target.x,
        clientY: target.y,
      }),
    );
    await rendered();
    expect(to!.classList.contains("target")).toBe(true);
    expect(document.querySelector(".canvas-link-draft")?.getAttribute("d")).toBeTruthy();
    release(target);
    await rendered();
    expect(document.querySelectorAll(".canvas-link")).toHaveLength(1);

    await dragFrom(handle, start, canvasPoint(500, 600));
    expect(document.querySelectorAll(".canvas-link")).toHaveLength(1);
    expect(document.querySelectorAll(".canvas-node")).toHaveLength(2);
  });

  it("関連を選ぶと検査パネルに出し、曲がり具合のハンドルは出さない", async () => {
    await open();
    const hit = document.querySelector(".canvas-link .hit-path")!;
    const point = hit.getBoundingClientRect();
    press(hit, { x: point.left, y: point.top }, { button: 2 });
    press(hit, { x: point.left, y: point.top });
    release({ x: point.left, y: point.top });
    await expect.element(heading("関連")).toBeVisible();
    expect(document.querySelector(".canvas-link.selected")).not.toBeNull();
    expect(document.querySelector(".curve-handle")).toBeNull();
  });

  it("ループの記号をドラッグで動かし、位置を戻せる", async () => {
    await open();
    const marker = page.getByRole("button", { name: /負荷と離職の悪循環/ }).first();
    await expect.element(marker).toBeVisible();
    const element = document.querySelector('.canvas-loop-marker[aria-label*="負荷と離職"]')!;
    const start = centerOf(element);
    await dragFrom(element, start, offset(start, 50, 50));
    await expect.element(heading("自己強化ループ").or(heading("バランスループ"))).toBeVisible();
    const reset = page.getByRole("button", { name: "記号の位置を戻す" });
    await reset.click();
    await expect.element(reset).not.toBeInTheDocument();
    await expect.poll(() => document.activeElement).toBe(inspector());
  });

  it("ダブルクリックした変数の名前を編集する", async () => {
    await open();
    const point = centerOf(nodeElement("sales"));
    const rect = canvasSvg().getBoundingClientRect();
    await userEvent.dblClick(canvas(), {
      position: { x: point.x - rect.left, y: point.y - rect.top },
    });
    await expect.element(page.getByRole("textbox", { name: "変数の名前" })).toHaveValue("売上");
  });
});

describe("取り消しと例外的な操作", () => {
  it("少しだけ動かしたのはクリック、引いている途中で中断したら関連は作らない", async () => {
    await open();
    const target = nodeElement("profit");
    const start = centerOf(target);
    press(target, start);
    canvasSvg().dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        bubbles: true,
        clientX: start.x + 1,
        clientY: start.y,
      }),
    );
    release(offset(start, 1, 0));
    await rendered();
    expect(Math.round(centerOf(nodeElement("profit")).x - start.x)).toBe(0);
    await expect.element(heading("変数")).toBeVisible();

    const links = document.querySelectorAll(".canvas-link").length;
    const handle = nodeElement("profit").querySelector(".connect-handle")!;
    const from = centerOf(handle);
    await dragFrom(handle, from, canvasPoint(100, 600), { end: "pointercancel" });
    expect(document.querySelectorAll(".canvas-link")).toHaveLength(links);
    expect(document.querySelector(".canvas-link-draft")).toBeNull();
  });

  it("関連の上のダブルクリックでは変数を足さず、編集中の変数を押しても編集を続ける", async () => {
    await open();
    const count = document.querySelectorAll(".canvas-node").length;
    const path = document.querySelector(".canvas-link .hit-path")!;
    const total = (path as SVGPathElement).getTotalLength();
    const point = (path as SVGPathElement).getPointAtLength(total / 3);
    const matrix = (path as SVGPathElement).getScreenCTM()!;
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    const rect = canvasSvg().getBoundingClientRect();
    await userEvent.dblClick(canvas(), {
      position: { x: screen.x - rect.left, y: screen.y - rect.top },
    });
    expect(document.querySelectorAll(".canvas-node")).toHaveLength(count);

    nodeElement("sales").focus();
    await userEvent.keyboard("{F2}");
    await expect.element(page.getByRole("textbox", { name: "変数の名前" })).toHaveFocus();
    const body = nodeElement("sales").querySelector(".body-rect")!;
    press(body, centerOf(body));
    release(centerOf(body));
    await rendered();
    expect(inlineLabel()).not.toBeNull();
  });

  it("関連を選んだまま Enter を押しても、名前の編集は始めない", async () => {
    await open();
    const polarity = document.querySelector<SVGGElement>(".polarity-button")!;
    polarity.focus();
    await expect.element(heading("関連")).toBeVisible();
    nodeElement("sales").blur();
    polarity.blur();
    polarity.focus();
    await expect.element(heading("関連")).toBeVisible();
    polarity.blur();
    await userEvent.keyboard("{Enter}");
    expect(inlineLabel()).toBeNull();
    await expect.element(heading("関連")).toBeVisible();
  });

  it("注目するループのピンを押すと注目から外す", async () => {
    await open();
    const featured = () =>
      document.querySelectorAll('[data-loop-key] [aria-pressed="true"]').length;
    const before = featured();
    await page
      .elementLocator(document.querySelector('[data-loop-key] [aria-pressed="true"]')!)
      .click();
    await expect.poll(featured).toBe(before - 1);
  });
});

describe("表示倍率", () => {
  it("ホイールで動かし、Ctrl+ホイールとボタンで拡大縮小し、全体を表示し直す", async () => {
    await open();
    const svg = canvasSvg();
    const before = centerOf(nodeElement("sales"));
    const fitted = zoomValue();
    svg.dispatchEvent(new WheelEvent("wheel", { deltaX: 10, deltaY: 20, cancelable: true }));
    await rendered();
    expect(Math.round(centerOf(nodeElement("sales")).y - before.y)).toBe(-20);

    const zoom = zoomValue();
    svg.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -50, ctrlKey: true, clientX: 400, clientY: 300 }),
    );
    await rendered();
    expect(zoomValue()).not.toBe(zoom);

    await page.getByRole("button", { name: "拡大" }).click();
    const larger = zoomValue();
    await page.getByRole("button", { name: "縮小" }).click();
    expect(zoomValue()).not.toBe(larger);
    await page.getByRole("button", { name: "全体を表示" }).click();
    await rendered();
    expect(zoomValue()).toBe(fitted);
    expect(Math.round(centerOf(nodeElement("sales")).x)).toBe(Math.round(before.x));
    expect(Math.round(centerOf(nodeElement("sales")).y)).toBe(Math.round(before.y));
  });
});

describe("キーボードでの操作", () => {
  it("矢印キーで動かし、F2 や Enter で名前を編集し、Escape で取り消す", async () => {
    await open();
    const target = nodeElement("sales");
    const start = centerOf(target);
    target.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    await userEvent.keyboard("{Shift>}{ArrowLeft}{ArrowUp}{/Shift}");
    await rendered();
    const moved = centerOf(nodeElement("sales"));
    expect(Math.round(moved.x - start.x)).toBeLessThan(0);
    expect(Math.round(moved.y - start.y)).toBeLessThan(0);

    await userEvent.keyboard("{F2}");
    const input = page.getByRole("textbox", { name: "変数の名前" });
    await expect.element(input).toHaveFocus();
    await userEvent.keyboard("x");
    await expect.element(node("x")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await expect.element(node("売上")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect.element(input).toHaveFocus();
    await userEvent.keyboard("{Control>}a{/Control}収益");
    (document.activeElement as HTMLElement).blur();
    await expect.element(node("収益")).toBeVisible();
  });

  it("Enter や Space で変数・関連・ループを選び、関連の極性を切り替える", async () => {
    await open();
    nodeElement("attrition").focus();
    await userEvent.keyboard(" ");
    await expect.element(heading("変数")).toBeVisible();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("textbox", { name: "変数の名前" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");

    const polarity = page.getByRole("button", { name: "社員数から売上への関連（プラス）" });
    (polarity.element() as SVGGElement).focus();
    await expect.element(heading("関連")).toBeVisible();
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("button", { name: "社員数から売上への関連（マイナス）" }))
      .toBeInTheDocument();
    await userEvent.keyboard("a");
    await page.getByRole("button", { name: /^社員数から売上への関連/ }).click();
    await expect
      .element(page.getByRole("button", { name: "社員数から売上への関連（プラス）" }))
      .toBeInTheDocument();

    const marker = document.querySelector<SVGGElement>(
      '.canvas-loop-marker[aria-label*="成長エンジン"]',
    )!;
    marker.focus();
    await expect.element(page.getByRole("textbox", { name: "名前" })).toHaveValue("成長エンジン");
    nodeElement("sales").focus();
    marker.focus();
    await userEvent.keyboard("a{Enter}");
    await expect.element(page.getByRole("textbox", { name: "名前" })).toHaveValue("成長エンジン");
  });
});

describe("表示", () => {
  it("名前の無い変数は「名称未設定」と表示し、ループを指すと他を薄くする", async () => {
    const diagram = createSampleDiagram();
    await open({
      ...diagram,
      variables: diagram.variables.map((variable) =>
        variable.id === "attrition" ? { ...variable, label: "" } : variable,
      ),
    });
    await expect
      .element(page.getByRole("button", { name: "名称未設定", exact: true }))
      .toBeVisible();
    expect(document.querySelectorAll(".delay-path").length).toBeGreaterThan(0);
    const item = document.querySelector("[data-loop-key]")!;
    item.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    item.dispatchEvent(new PointerEvent("pointerenter"));
    await rendered();
    expect(document.querySelectorAll(".canvas-link.dimmed").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".canvas-node.dimmed").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".canvas-loop-marker.dimmed").length).toBeGreaterThan(0);
    item.dispatchEvent(new PointerEvent("pointerleave"));
    await rendered();
    expect(document.querySelectorAll(".canvas-link.dimmed")).toHaveLength(0);
  });
});

describe("選んだ変数のまわり", () => {
  it("変数を選ぶと、直接の原因と結果だけを残してほかを薄くする", async () => {
    await open();
    nodeElement("sales").focus();
    await expect.poll(() => nodeElement("attrition").classList.contains("faded")).toBe(true);
    expect(nodeElement("staff").classList.contains("faded")).toBe(false);
    expect(nodeElement("profit").classList.contains("faded")).toBe(false);
    expect(document.querySelector('[data-link-id="l_sales"]')!.classList.contains("faded")).toBe(
      false,
    );
    expect(document.querySelector('[data-link-id="l_leave"]')!.classList.contains("faded")).toBe(
      true,
    );
    const markers = [...document.querySelectorAll(".canvas-loop-marker")];
    expect(markers.some((marker) => marker.classList.contains("faded"))).toBe(true);
    expect(markers.some((marker) => !marker.classList.contains("faded"))).toBe(true);
  });

  it("矢印の無い変数を選んだときや、名前の入力中は薄くしない", async () => {
    await open();
    await userEvent.dblClick(canvas(), { position: { x: 40, y: 40 } });
    await expect.element(page.getByRole("textbox", { name: "変数の名前" })).toHaveFocus();
    expect(document.querySelectorAll(".canvas-node.faded")).toHaveLength(0);
    await userEvent.keyboard("{Escape}");
    expect(document.querySelectorAll(".canvas-node.faded")).toHaveLength(0);
  });
});

describe("右クリック", () => {
  it("押したまま（macOS の Ctrl+クリックや長押し）でメニューが開いたら、ドラッグを続けない", async () => {
    await open();
    const sales = nodeElement("sales");
    const before = sales.getAttribute("transform");
    const start = centerOf(sales);
    press(sales, start);
    sales.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    canvasSvg().dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        bubbles: true,
        clientX: start.x + 60,
        clientY: start.y + 60,
      }),
    );
    await rendered();
    expect(nodeElement("sales").getAttribute("transform")).toBe(before);
  });
});
