import { createSampleDiagram } from "@loopcraft/core/sample";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  agentTurn,
  canvasSvg,
  cleanup,
  fakeAgentClient,
  fakeFileStore,
  fileStartup,
  mount,
  node,
  nodeElement,
  notice,
  page,
  userEvent,
} from "../testing/app.ts";

afterEach(cleanup);

const ok = () => ({ status: "ok" as const, diagram: createSampleDiagram(), revision: "r" });

function mountWithAgent() {
  const agent = fakeAgentClient();
  const file = fakeFileStore();
  mount(fileStartup(ok(), { store: file.store, agent: agent.client }));
  return { ...agent, file };
}

const aiButton = () => page.getByRole("button", { name: "AI", exact: true });
const panel = () => page.getByRole("complementary", { name: "AI" });
const promptInput = () => page.getByRole("textbox", { name: "AI への指示" });
/** getByRole で取らないのは、隠した一覧はアクセシビリティツリーに載らず、見つからないため */
const listsVisible = () =>
  document.querySelector('[role="tablist"][aria-label="一覧"]')!.checkVisibility();
/** 空白を除くのは、行の中の要素の間の改行や字下げで、文言の比べ方が揺れないため */
const textOf = (element: Element) => element.textContent?.replace(/\s+/g, "") ?? "";
const banner = () => page.getByRole("status").filter({ hasText: "AI が図を変えています" });

describe("AI に図を変えてもらう", () => {
  it("serve が AI を使えないときは、AI のボタンを出さない", async () => {
    mount(fileStartup(ok()));
    await expect.element(node("社員数")).toBeVisible();
    await expect.element(aiButton()).not.toBeInTheDocument();
  });

  it("AI のパネルを開くと一覧と入れ替わり、閉じると戻る", async () => {
    mountWithAgent();
    await aiButton().click();
    await expect.element(aiButton()).toHaveAttribute("aria-pressed", "true");
    await expect.element(panel()).toBeVisible();
    expect(listsVisible()).toBe(false);
    await expect.poll(() => textOf(panel().element())).toContain("ClaudeCode9.9.9");
    await panel().getByRole("button", { name: "README を読んで、足りない変数を挙げて" }).click();
    await expect.element(promptInput()).toHaveValue("README を読んで、足りない変数を挙げて");
    await expect.element(promptInput()).toHaveFocus();
    await panel().getByRole("button", { name: "閉じる" }).click();
    await expect.element(panel()).not.toBeInTheDocument();
    expect(listsVisible()).toBe(true);
  });

  it("選んでいる変数を添えて、画面の図を保存してから指示を送る", async () => {
    const { control, file } = mountWithAgent();
    await node("離職数").click();
    await aiButton().click();
    await expect.element(panel().getByText("選んでいる変数")).toBeVisible();
    await userEvent.fill(promptInput(), "打ち手を足して");
    await userEvent.keyboard("{Enter}");
    await expect
      .poll(() => control.prompts)
      .toEqual([
        {
          prompt: "打ち手を足して",
          selection: { kind: "variable", id: "attrition", label: "離職数" },
        },
      ]);
    expect(file.control.saved.at(-1)).toEqual(createSampleDiagram());
    await expect.element(promptInput()).toHaveValue("");

    await panel().getByRole("button", { name: "離職数を指示に含めない" }).click();
    await userEvent.fill(promptInput(), "並べ直して");
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    await expect.element(promptInput()).toHaveValue("並べ直して\n");
    await panel().getByRole("button", { name: "送る" }).click();
    await expect.poll(() => control.prompts.at(-1)).toEqual({ prompt: "並べ直して" });
  });

  it("選んでいる関連やループも、名前を添えて送る", async () => {
    const { control } = mountWithAgent();
    await aiButton().click();
    // click で選ばないのは、極性の印を押すと極性まで変わるため
    const polarity = page.getByRole("button", { name: /^社員数から売上への関連/ }).element();
    polarity.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    canvasSvg().dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    await expect.poll(() => textOf(panel().element())).toContain("選んでいる関連社員数→売上");
    await page
      .getByRole("button", { name: /成長エンジン/ })
      .first()
      .click();
    await expect.poll(() => textOf(panel().element())).toContain("選んでいるループ成長エンジン");
    await userEvent.fill(promptInput(), "強めて");
    await userEvent.keyboard("{Enter}");
    await expect
      .poll(() => control.prompts.at(-1)?.selection)
      .toEqual({ kind: "loop", id: "p_growth", label: "成長エンジン" });
  });

  it("AI が動いている間は編集できず、帯やパネルから止められる", async () => {
    const { control } = mountWithAgent();
    await aiButton().click();
    control.push(agentTurn({ activity: "checking" }));
    await expect.element(banner()).toBeVisible();
    await expect.element(page.getByRole("button", { name: "変数を追加" })).not.toBeInTheDocument();
    await expect.element(promptInput()).toBeDisabled();
    await expect.element(panel().getByText("ループと配置を確かめています")).toBeVisible();
    await expect.element(panel().getByRole("button", { name: "新しい会話" })).toBeDisabled();
    await banner().getByRole("button", { name: "停止" }).click();
    await panel().getByRole("button", { name: "停止" }).click();
    expect(control.stops).toBe(2);

    control.push(agentTurn({ status: "stopped", endedAt: 3000 }));
    await expect.element(banner()).not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "変数を追加" })).toBeVisible();
    await expect.element(panel().getByText("停止しました")).toBeVisible();
  });

  it("変えた所を一覧とキャンバスで示し、指示ごとに取り消せる", async () => {
    const { control } = mountWithAgent();
    await aiButton().click();
    control.push(
      agentTurn({
        status: "done",
        endedAt: 18_000,
        undoable: true,
        touched: { variables: ["attrition"], links: ["l_leave"] },
        items: [
          {
            kind: "changes",
            changes: [
              { kind: "variable-added", label: "面談の回数" },
              { kind: "link-added", from: "離職数", to: "面談の回数", polarity: "+" },
            ],
          },
          { kind: "checked", loops: { R: 2, B: 3 }, errors: 0 },
          { kind: "text", text: "バランスループを足しました。" },
        ],
      }),
    );
    const steps = panel().getByRole("list", { name: "AI がしたこと" });
    await expect.poll(() => textOf(steps.element())).toContain("変数を追加面談の回数");
    expect(textOf(steps.element())).toContain("関連を追加離職数→面談の回数+");
    expect(textOf(steps.element())).toContain("確かめたループR2・B3、配置の崩れなし");
    await expect.element(panel().getByText("バランスループを足しました。")).toBeVisible();
    await expect.element(panel().getByText("18 秒")).toBeVisible();
    expect(nodeElement("attrition").classList).toContain("touched");
    expect(document.querySelector('[data-link-id="l_leave"]')!.classList).toContain("touched");
    await expect.element(panel().getByText("AI が変えた所")).toBeVisible();

    await panel().getByRole("button", { name: "この指示の変更を取り消す" }).click();
    expect(control.undone).toEqual(["turn-1"]);
    control.push(agentTurn({ status: "done", endedAt: 18_000, undone: true }));
    await expect.element(panel().getByText("取り消しました")).toBeVisible();
    expect(nodeElement("attrition").classList).not.toContain("touched");
  });

  it("失敗したら理由を出し、同じ指示を送り直せる", async () => {
    const { control } = mountWithAgent();
    await aiButton().click();
    control.push(agentTurn({ status: "failed", error: "API Error: Overloaded", endedAt: 1000 }));
    await expect.element(panel().getByText("AI の実行に失敗しました")).toBeVisible();
    await expect.element(panel().getByText("API Error: Overloaded")).toBeVisible();
    await panel().getByRole("button", { name: "もう一度送る" }).click();
    await expect.poll(() => control.prompts.at(-1)?.prompt).toBe("離職数を減らす打ち手を足して");
  });

  it("送れなければお知らせで伝え、入力した指示は残す", async () => {
    const { control } = mountWithAgent();
    control.result = { ok: false, reason: "failed", error: new Error("HTTP 500") };
    await aiButton().click();
    await userEvent.fill(promptInput(), "足して");
    await userEvent.keyboard("{Enter}");
    await expect.element(notice()).toMatchTextContent(/AI に指示を送れませんでした/);
    await expect.element(promptInput()).toHaveValue("足して");
    await expect.element(promptInput()).toBeEnabled();
  });

  it("AI が書き換えた図は、外部の変更として知らせずに取り込む", async () => {
    const { file } = mountWithAgent();
    file.control.reloadResult = {
      ok: true,
      diagram: { ...createSampleDiagram(), title: "AI が直した" },
    };
    file.control.handlers().change("agent");
    await expect
      .element(page.getByRole("textbox", { name: "図のタイトル" }))
      .toHaveValue("AI が直した");
    await expect.element(notice()).not.toBeInTheDocument();
  });
});
