import { createEmptyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import type { Diagram } from "@loopcraft/core/schema";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  browserStartup,
  canvas,
  canvasPoint,
  centerOf,
  cleanup,
  dragFrom,
  fileStartup,
  mount,
  node,
  nodeElement,
  page,
  userEvent,
} from "../testing/app.tsx";

afterEach(cleanup);

async function open(diagram: Diagram = createSampleDiagram()) {
  mount(browserStartup(diagram));
  // mount 直後に操作しないのは、大きさを測って全体を表示するまで要素の位置が定まらないため
  await settle();
}

async function settle() {
  for (let frame = 0; frame < 3; frame++) {
    await new Promise(requestAnimationFrame);
    flush();
  }
}

const heading = (name: string) => page.getByRole("heading", { name, exact: true });
const zoomValue = () => document.querySelector("[data-testid=zoom-value]")!.textContent;
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
  document.querySelector(".canvas-svg")!.dispatchEvent(
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
    const background = document.querySelector(".grid-bg")!;
    dragFrom(background, canvasPoint(40, 40), canvasPoint(140, 110));
    flush();
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
    dragFrom(target.querySelector(".node-body")!, start, offset(start, 80, 40));
    flush();
    expect(Math.round(centerOf(nodeElement("profit")).x - start.x)).toBe(80);

    const moved = centerOf(nodeElement("profit"));
    dragFrom(nodeElement("profit").querySelector(".node-body")!, moved, offset(moved, 60, 0), {
      end: "pointercancel",
    });
    flush();
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
    flush();
    expect(Math.round(centerOf(nodeElement("profit")).x - start.x)).toBe(0);

    press(target, start);
    press(nodeElement("sales"), centerOf(nodeElement("sales")), { pointerId: 2 });
    const svg = document.querySelector(".canvas-svg")!;
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
    flush();
    expect(Math.round(centerOf(nodeElement("profit")).x - start.x)).toBe(30);
  });

  it("右端の点を引いて、別の変数か何もない所で離すと関連ができる", async () => {
    await open(createEmptyDiagram());
    await userEvent.dblClick(canvas(), { position: { x: 300, y: 300 } });
    await userEvent.keyboard("原因{Enter}");
    await userEvent.dblClick(canvas(), { position: { x: 700, y: 300 } });
    await userEvent.keyboard("結果{Enter}");
    await expect.element(node("結果")).toBeVisible();
    const [from, to] = [...document.querySelectorAll<SVGGElement>(".node")];
    const handle = from!.querySelector(".node-handle")!;
    const start = centerOf(handle);

    dragFrom(handle, start, centerOf(from!));
    dragFrom(handle, start, offset(start, 20, 0));
    expect(document.querySelectorAll(".link")).toHaveLength(0);

    press(handle, start);
    const svg = document.querySelector(".canvas-svg")!;
    const target = centerOf(to!);
    svg.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        bubbles: true,
        clientX: target.x,
        clientY: target.y,
      }),
    );
    flush();
    expect(to!.classList.contains("target")).toBe(true);
    expect(document.querySelector(".link-draft")?.getAttribute("d")).toBeTruthy();
    release(target);
    flush();
    expect(document.querySelectorAll(".link")).toHaveLength(1);

    dragFrom(handle, start, canvasPoint(500, 600));
    await expect.element(page.getByRole("textbox", { name: "変数の名前" })).toHaveFocus();
    expect(document.querySelectorAll(".link")).toHaveLength(2);
  });

  it("関連を選ぶと検査パネルに出し、曲がり具合のハンドルは出さない", async () => {
    await open();
    const hit = document.querySelector(".link .link-hit")!;
    const point = hit.getBoundingClientRect();
    press(hit, { x: point.left, y: point.top }, { button: 2 });
    press(hit, { x: point.left, y: point.top });
    release({ x: point.left, y: point.top });
    await expect.element(heading("関連")).toBeVisible();
    expect(document.querySelector(".link.selected")).not.toBeNull();
    expect(document.querySelector(".curve-handle")).toBeNull();
  });

  it("ループの記号をドラッグで動かし、位置を戻せる", async () => {
    await open();
    const marker = page.getByRole("button", { name: /負荷と離職の悪循環/ }).first();
    await expect.element(marker).toBeVisible();
    const element = document.querySelector('.loop-marker[aria-label*="負荷と離職"]')!;
    const start = centerOf(element);
    dragFrom(element, start, offset(start, 50, 50));
    await expect.element(heading("自己強化ループ").or(heading("バランスループ"))).toBeVisible();
    const reset = page.getByRole("button", { name: "記号の位置を戻す" });
    await expect.element(reset).not.toBeDisabled();
    await reset.click();
    await expect.element(reset).toBeDisabled();
  });

  it("ダブルクリックした変数の名前を編集する", async () => {
    await open();
    const point = centerOf(nodeElement("sales"));
    const rect = document.querySelector(".canvas-svg")!.getBoundingClientRect();
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
    document.querySelector(".canvas-svg")!.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        bubbles: true,
        clientX: start.x + 1,
        clientY: start.y,
      }),
    );
    release(offset(start, 1, 0));
    flush();
    expect(Math.round(centerOf(nodeElement("profit")).x - start.x)).toBe(0);
    await expect.element(heading("変数")).toBeVisible();

    const links = document.querySelectorAll(".link").length;
    const handle = nodeElement("profit").querySelector(".node-handle")!;
    const from = centerOf(handle);
    dragFrom(handle, from, canvasPoint(100, 600), { end: "pointercancel" });
    expect(document.querySelectorAll(".link")).toHaveLength(links);
    expect(document.querySelector(".link-draft")).toBeNull();
  });

  it("関連の上のダブルクリックでは変数を足さず、編集中の変数を押しても編集を続ける", async () => {
    await open();
    const count = document.querySelectorAll(".node").length;
    const path = document.querySelector(".link .link-hit")!;
    const total = (path as SVGPathElement).getTotalLength();
    const point = (path as SVGPathElement).getPointAtLength(total / 3);
    const matrix = (path as SVGPathElement).getScreenCTM()!;
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    const rect = document.querySelector(".canvas-svg")!.getBoundingClientRect();
    await userEvent.dblClick(canvas(), {
      position: { x: screen.x - rect.left, y: screen.y - rect.top },
    });
    expect(document.querySelectorAll(".node")).toHaveLength(count);

    nodeElement("sales").focus();
    await userEvent.keyboard("{F2}");
    await expect.element(page.getByRole("textbox", { name: "変数の名前" })).toHaveFocus();
    const body = nodeElement("sales").querySelector(".node-body")!;
    press(body, centerOf(body));
    release(centerOf(body));
    flush();
    expect(document.querySelector(".inline-label")).not.toBeNull();
  });

  it("関連を選んだまま Enter を押しても、名前の編集は始めない", async () => {
    await open();
    const polarity = document.querySelector<SVGGElement>(".polarity")!;
    polarity.focus();
    await expect.element(heading("関連")).toBeVisible();
    nodeElement("sales").blur();
    polarity.blur();
    polarity.focus();
    await expect.element(heading("関連")).toBeVisible();
    polarity.blur();
    await userEvent.keyboard("{Enter}");
    expect(document.querySelector(".inline-label")).toBeNull();
    await expect.element(heading("関連")).toBeVisible();
  });

  it("見出したループのピンを押すと見出しを外す", async () => {
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
    const svg = document.querySelector(".canvas-svg")!;
    const before = centerOf(nodeElement("sales"));
    const fitted = zoomValue();
    svg.dispatchEvent(new WheelEvent("wheel", { deltaX: 10, deltaY: 20, cancelable: true }));
    flush();
    expect(Math.round(centerOf(nodeElement("sales")).y - before.y)).toBe(-20);

    const zoom = zoomValue();
    svg.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -50, ctrlKey: true, clientX: 400, clientY: 300 }),
    );
    flush();
    expect(zoomValue()).not.toBe(zoom);

    await page.getByRole("button", { name: "拡大" }).click();
    const larger = zoomValue();
    await page.getByRole("button", { name: "縮小" }).click();
    expect(zoomValue()).not.toBe(larger);
    await page.getByRole("button", { name: "全体を表示" }).click();
    flush();
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
    flush();
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

    const polarity = page.getByRole("button", { name: /^社員数から売上への関連、極性プラス/ });
    (polarity.element() as SVGGElement).focus();
    await expect.element(heading("関連")).toBeVisible();
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("button", { name: /^社員数から売上への関連、極性マイナス/ }))
      .toBeInTheDocument();
    await userEvent.keyboard("a");
    await page.getByRole("button", { name: /^社員数から売上への関連/ }).click();
    await expect
      .element(page.getByRole("button", { name: /^社員数から売上への関連、極性プラス/ }))
      .toBeInTheDocument();

    const marker = document.querySelector<SVGGElement>('.loop-marker[aria-label*="成長エンジン"]')!;
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
    expect(document.querySelectorAll(".delay-mark").length).toBeGreaterThan(0);
    const item = document.querySelector("[data-loop-key]")!;
    item.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    item.dispatchEvent(new PointerEvent("pointerenter"));
    flush();
    expect(document.querySelectorAll(".link.dimmed").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".node.dimmed").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".loop-marker.dimmed").length).toBeGreaterThan(0);
    item.dispatchEvent(new PointerEvent("pointerleave"));
    flush();
    expect(document.querySelectorAll(".link.dimmed")).toHaveLength(0);
  });
});

// 位置を省くと 0, 0 で送るのは、キーボードのメニューキーで開くとそう届くため
function openMenu(target: Element, point?: { x: number; y: number }) {
  target.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: point?.x ?? 0,
      clientY: point?.y ?? 0,
    }),
  );
}
const menu = (name: string) => page.getByRole("menu", { name });
const menuItem = (name: string | RegExp) => page.getByRole("menuitem", { name });

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
    const markers = [...document.querySelectorAll(".loop-marker")];
    expect(markers.some((marker) => marker.classList.contains("faded"))).toBe(true);
    expect(markers.some((marker) => !marker.classList.contains("faded"))).toBe(true);
  });

  it("矢印の無い変数を選んだときや、名前の入力中は薄くしない", async () => {
    await open();
    await userEvent.dblClick(canvas(), { position: { x: 40, y: 40 } });
    await expect.element(page.getByRole("textbox", { name: "変数の名前" })).toHaveFocus();
    expect(document.querySelectorAll(".node.faded")).toHaveLength(0);
    await userEvent.keyboard("{Escape}");
    expect(document.querySelectorAll(".node.faded")).toHaveLength(0);
  });
});

describe("右クリックのメニュー", () => {
  it("変数のメニューで名前を変え、削除でき、Escape で閉じると変数へフォーカスを戻す", async () => {
    await open();
    const sales = nodeElement("sales");
    openMenu(sales, centerOf(sales));
    await expect.element(menu("「売上」の操作")).toBeVisible();
    await expect.element(menuItem(/名前を変える/)).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(menuItem(/矢印を引く/)).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(menuItem(/変数を削除/)).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(menuItem(/名前を変える/)).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect.element(menu("「売上」の操作")).not.toBeInTheDocument();
    await expect.element(node("売上")).toHaveFocus();

    openMenu(nodeElement("sales"));
    await menuItem(/名前を変える/).click();
    await expect.element(page.getByRole("textbox", { name: "変数の名前" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");

    openMenu(nodeElement("sales"), centerOf(nodeElement("sales")));
    await expect.element(menuItem(/名前を変える/)).toHaveFocus();
    await userEvent.keyboard("{Delete}");
    await expect.element(node("売上")).toBeVisible();

    await menuItem(/変数を削除/).click();
    await expect.element(node("売上")).not.toBeInTheDocument();
  });

  it("図や表示範囲が変わったら閉じ、項目を選んだ後は元の要素へフォーカスを戻す", async () => {
    await open();
    const link = () => document.querySelector('[data-link-id="l_sales"]')!;
    const at = () => centerOf(link().querySelector(".polarity")!);
    openMenu(link().querySelector(".link-hit")!, at());
    await menuItem("遅れを付ける").click();
    await expect.poll(() => document.activeElement?.closest("[data-link-id]")).toBe(link());

    openMenu(link().querySelector(".link-hit")!, at());
    await expect.element(menu("関連の操作")).toBeVisible();
    // ショートカットで元に戻さないのは、メニューを開いている間はキーが図に届かないため
    (document.querySelector('[aria-label="元に戻す"]') as HTMLButtonElement).click();
    await expect.element(menu("関連の操作")).not.toBeInTheDocument();

    openMenu(document.querySelector(".grid-bg")!, canvasPoint(40, 40));
    await expect.element(menu("キャンバスの操作")).toBeVisible();
    (document.querySelector('[title="拡大"]') as HTMLButtonElement).click();
    await expect.element(menu("キャンバスの操作")).not.toBeInTheDocument();
  });

  it("関連のメニューで極性と遅れを切り替え、削除できる", async () => {
    await open();
    const link = () => document.querySelector('[data-link-id="l_sales"]')!;
    const hit = () => link().querySelector(".link-hit")!;
    openMenu(hit(), centerOf(link().querySelector(".polarity")!));
    await menuItem("極性を −（逆向き）にする").click();
    await expect.poll(() => link().classList.contains("negative")).toBe(true);
    openMenu(hit(), centerOf(link().querySelector(".polarity")!));
    await menuItem("遅れを付ける").click();
    await expect.poll(() => link().querySelector(".delay-mark")).not.toBeNull();
    openMenu(hit(), centerOf(link().querySelector(".polarity")!));
    await menuItem(/関連を削除/).click();
    await expect.poll(() => document.querySelector('[data-link-id="l_sales"]')).toBeNull();
  });

  it("押したまま（macOS の Ctrl+クリックや長押し）でも開き、Tab で閉じると元へ戻り、拡大縮小で閉じる", async () => {
    await open();
    const sales = nodeElement("sales");
    press(sales, centerOf(sales));
    openMenu(sales, centerOf(sales));
    await expect.element(menu("「売上」の操作")).toBeVisible();
    await userEvent.keyboard("{Tab}");
    await expect.element(menu("「売上」の操作")).not.toBeInTheDocument();
    await expect.element(node("売上")).toHaveFocus();

    openMenu(sales, centerOf(sales));
    await expect.element(menu("「売上」の操作")).toBeVisible();
    canvas()
      .element()
      .dispatchEvent(
        new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -50 }),
      );
    await expect.element(menu("「売上」の操作")).not.toBeInTheDocument();
  });

  it("キャンバスのメニューで変数を足し、外側を押すと閉じる。読み取り専用では開かない", async () => {
    await open();
    const background = document.querySelector(".grid-bg")!;
    const point = canvasPoint(40, 40);
    openMenu(background, point);
    await expect.element(menuItem("整列")).toBeEnabled();
    await menuItem("ここに変数を追加").click();
    await expect.poll(() => document.querySelectorAll(".node").length).toBe(8);

    openMenu(background, point);
    await expect.element(menu("キャンバスの操作")).toBeVisible();
    background.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await expect.element(menu("キャンバスの操作")).not.toBeInTheDocument();

    mount(
      fileStartup(
        { status: "ok", diagram: createSampleDiagram(), revision: "r" },
        { readonly: true },
      ),
    );
    await settle();
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.querySelector(".grid-bg")!.dispatchEvent(event);
    expect(document.querySelector("[role=menu]")).toBeNull();
    expect(event.defaultPrevented).toBe(false);
  });
});
