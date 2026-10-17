import { createEmptyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import type { Diagram, LinkId, VariableId } from "@loopcraft/core/schema";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  browserStartup,
  captureDownloads,
  cleanup,
  expandButton,
  fileStartup,
  mount,
  node,
  nodeElement,
  notice,
  page,
  userEvent,
} from "../testing/app.ts";

afterEach(cleanup);

async function open(diagram: Diagram = createSampleDiagram()) {
  mount(browserStartup(diagram));
  await expect.element(node("社員数")).toBeVisible();
}

const heading = (name: string) => page.getByRole("heading", { name, exact: true });
const field = (name: string | RegExp) =>
  page.getByRole("textbox", { name, exact: typeof name === "string" });
const inspector = () => page.getByRole("region", { name: "選択中の項目" });

function stored(): Diagram {
  return JSON.parse(localStorage.getItem("loopcraft:document") ?? "null") as Diagram;
}

async function writeAndClearDescription(read: (diagram: Diagram) => string | undefined) {
  await userEvent.fill(field("説明"), "メモ");
  await expect.poll(() => read(stored())).toBe("メモ");
  await userEvent.fill(field("説明"), "");
  await expect.poll(() => read(stored())).toBeUndefined();
}
const button = (name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });

describe("図の概要", () => {
  it("伝えたいことを書ける", async () => {
    await open();
    await expect.element(heading("図の概要")).toBeVisible();
    await userEvent.fill(field(/^この図で伝えたいこと/), "成長と負荷");
    await expect.element(field(/^この図で伝えたいこと/)).toHaveValue("成長と負荷");
  });

  it("退避したデータを書き出し、確かめてから削除する", async () => {
    const downloads = captureDownloads();
    try {
      localStorage.setItem("loopcraft:document:backup:1700000000000", "{");
      localStorage.setItem("loopcraft:document:backup:1700000001000", "[");
      mount(browserStartup(createSampleDiagram()));
      await expect.element(page.getByText("退避したデータ")).toBeVisible();
      await button("書き出す").first().click();
      expect(downloads.files).toEqual(["system-diagram-backup-1700000001000.json"]);

      await button("削除").first().click();
      await expect.element(button("削除する")).toBeVisible();
      await button("やめる").click();
      await expect.element(button("削除する")).not.toBeInTheDocument();
      await button("削除").first().click();
      await button("削除する").click();
      await expect.poll(() => button("書き出す").all().length).toBe(1);

      // localStorage を直接消すのは、別のタブで消された状態をまねるため
      localStorage.removeItem("loopcraft:document:backup:1700000000000");
      await button("書き出す").click();
      await expect
        .element(page.getByRole("alert"))
        .toMatchTextContent(/退避したデータが見つかりません/);
      await expect.element(page.getByText("退避したデータ")).not.toBeInTheDocument();
    } finally {
      downloads.restore();
    }
  });

  it("最後の退避データを消したら、検査パネルにフォーカスを戻す", async () => {
    localStorage.setItem("loopcraft:document:backup:1700000000000", "{");
    mount(browserStartup(createSampleDiagram()));
    await button("削除").click();
    await button("削除する").click();
    await expect.element(page.getByRole("region", { name: "選択中の項目" })).toHaveFocus();
  });
});

describe("変数", () => {
  it("広い画面では、選んでも一覧の位置を変えず、下端のボタンで変数を足す", async () => {
    await open();
    const listTop = () => document.querySelector("[role=tablist]")!.getBoundingClientRect().top;
    const before = listTop();
    nodeElement("profit").focus();
    await expect.element(button("変数を削除")).toBeVisible();
    expect(listTop()).toBe(before);
    expect(getComputedStyle(expandButton()).display).toBe("none");

    const variables = () => document.querySelectorAll("[data-variable-id]").length;
    const count = variables();
    await button("変数を追加").click();
    expect(variables()).toBe(count + 1);
  });

  it("名前と説明を書き換え、原因と結果を辿り、削除する", async () => {
    await open();
    nodeElement("sales").focus();
    await expect.element(heading("変数")).toBeVisible();
    await userEvent.fill(field("名前"), "売上高");
    await expect.element(node("売上高")).toBeVisible();
    await writeAndClearDescription(
      (diagram) => diagram.variables.find((item) => item.id === "sales")?.description,
    );

    await inspector()
      .getByRole("button", { name: /社員数$/ })
      .click();
    await expect.element(heading("関連")).toBeVisible();
    await inspector().getByRole("button", { name: "売上高" }).click();
    await expect.element(heading("変数")).toBeVisible();

    await inspector()
      .getByRole("button", { name: /一人あたりの業務量$/ })
      .click();
    await expect.element(heading("関連")).toBeVisible();
    await inspector().getByRole("button", { name: "売上高" }).click();
    await button(/変数を削除/).click();
    await expect.element(node("売上高")).not.toBeInTheDocument();
  });

  it("繋がりの無い変数は、無いことを示す", async () => {
    await open({
      ...createEmptyDiagram(),
      variables: [
        { id: "a" as VariableId, label: "", position: { x: 0, y: 0 } },
        { id: "b" as VariableId, label: "社員数", position: { x: 200, y: 0 } },
      ],
    });
    nodeElement("a").focus();
    await expect.element(page.getByText("この変数に影響する矢印はありません")).toBeVisible();
    await expect.element(page.getByText("この変数から出る矢印はありません")).toBeVisible();
  });
});

describe("関連", () => {
  it("極性・遅れ・説明を変え、付いていた曲がり具合を直線に戻し、削除する", async () => {
    await open({
      ...createSampleDiagram(),
      links: createSampleDiagram().links.map((link) =>
        link.id === "l_sales" ? { ...link, curvature: 0.4 } : link,
      ),
    });
    const polarity = () =>
      page.getByRole("button", { name: /^社員数から売上への関連/ }).element() as SVGGElement;
    polarity().focus();
    await expect.element(heading("関連")).toBeVisible();
    await expect.element(page.getByText("社員数が増えると売上も増える")).toBeVisible();
    await button(/逆向きに動く/).click();
    await expect.element(page.getByText("社員数が増えると売上は減る")).toBeVisible();
    await button(/同じ向きに動く/).click();
    // チェックボックスを直接押さないのは、見た目のスイッチの裏に隠れているため
    await page.getByText("遅れがある").click();
    await expect.element(page.getByRole("switch", { name: /遅れがある/ })).toBeChecked();
    await page.getByText("遅れがある").click();
    await expect.element(page.getByRole("switch", { name: /遅れがある/ })).not.toBeChecked();
    await writeAndClearDescription(
      (diagram) => diagram.links.find((item) => item.id === "l_sales")?.description,
    );
    await button("直線に戻す").click();
    await expect.element(button("直線に戻す")).not.toBeInTheDocument();
    // 削除ボタンへ戻さないのは、Enter を続けて押すと関連まで消してしまうため
    await expect.poll(() => document.activeElement === inspector().element()).toBe(true);
    await button(/関連を削除/).click();
    await expect.element(heading("図の概要")).toBeVisible();
    expect(document.querySelector('[aria-label^="社員数から売上への関連"]')).toBeNull();
  });

  it("既定の形と同じ曲がり具合なら戻すボタンを出さず、逆向きの関連があれば既定の曲がりに戻す", async () => {
    const sample = createSampleDiagram();
    const sales = sample.links.find((link) => link.id === "l_sales")!;
    await open({
      ...sample,
      links: sample.links.map((link) => (link.id === "l_sales" ? { ...link, curvature: 0 } : link)),
    });
    (
      page.getByRole("button", { name: /^社員数から売上への関連/ }).element() as SVGGElement
    ).focus();
    await expect.element(heading("関連")).toBeVisible();
    expect(inspector().element().textContent).not.toMatch(/に戻す/);

    await open({
      ...sample,
      links: [
        ...sample.links,
        { ...sales, id: "l_back" as LinkId, from: sales.to, to: sales.from, curvature: 0.4 },
      ],
    });
    (
      page.getByRole("button", { name: /^売上から社員数への関連/ }).element() as SVGGElement
    ).focus();
    await button("既定の曲がりに戻す").click();
    await expect.element(button("既定の曲がりに戻す")).not.toBeInTheDocument();
  });

  it("両端の変数に移れ、名前が無ければ「名称未設定」と示す", async () => {
    await open({
      ...createEmptyDiagram(),
      variables: [
        { id: "a" as VariableId, label: "", position: { x: 0, y: 0 } },
        { id: "b" as VariableId, label: "社員数", position: { x: 300, y: 0 } },
      ],
      links: [{ id: "l" as LinkId, from: "a" as VariableId, to: "b" as VariableId, polarity: "-" }],
    });
    (
      page.getByRole("button", { name: /^名称未設定から社員数への関連/ }).element() as SVGGElement
    ).focus();
    await expect.element(page.getByText("名称未設定が増えると社員数は減る")).toBeVisible();
    await button("社員数").last().click();
    await expect.element(field("名前")).toHaveValue("社員数");
  });
});

describe("ループ", () => {
  it("名前と説明を書き、経路と種類の理由を示し、見出しを外す", async () => {
    await open();
    await button(/成長エンジン/)
      .last()
      .click();
    await expect.element(heading("自己強化ループ")).toBeVisible();
    await expect
      .element(page.getByText("逆向きの関連が無いので、変化が増幅し続けます"))
      .toBeVisible();
    await userEvent.fill(field("名前"), "成長");
    await writeAndClearDescription(
      (diagram) => diagram.loops.find((item) => item.id === "p_growth")?.description,
    );
    await button("記号の位置を戻す").click();
    await page
      .getByRole("region", { name: "選んだ項目" })
      .getByRole("button", { name: "見出しを外す" })
      .click();
    await expect.element(heading("図の概要")).toBeVisible();

    await button(/負荷と離職の悪循環/)
      .last()
      .click();
    await expect.element(heading("自己強化ループ")).toBeVisible();
    await expect.element(page.getByText(/偶数なので変化が増幅/)).toBeVisible();
    await button(/育成の負担/)
      .last()
      .click();
    await expect.element(heading("バランスループ")).toBeVisible();
    await expect.element(page.getByText(/奇数なので変化を打ち消す/)).toBeVisible();
  });

  it("すべてのループを並べ、見出していないループは選ぶと強調し、ピンで見出す", async () => {
    await open();
    await expect.poll(() => document.querySelectorAll("[data-loop-key]").length).toBe(4);
    expect(document.querySelectorAll("[data-loop-key][data-kind=balancing]")).toHaveLength(2);

    const plain = [...document.querySelectorAll("[data-loop-key]")]
      .find((item) => item.querySelector('[aria-pressed="false"]'))!
      .querySelector("button")!;
    await page.elementLocator(plain).click();
    await expect
      .poll(() => document.querySelector('[data-loop-key] [aria-current="true"]'))
      .not.toBeNull();
    await page.elementLocator(plain).click();
    await userEvent.unhover(page.elementLocator(plain));
    await expect
      .poll(() => document.querySelector('[data-loop-key] [aria-current="true"]'))
      .toBeNull();

    await page
      .elementLocator(document.querySelector('[data-loop-key] [aria-pressed="false"]')!)
      .click();
    await expect
      .poll(() => document.querySelectorAll('[data-loop-key] [aria-pressed="true"]').length)
      .toBe(4);
  });

  it("ループが無いときは案内し、多すぎるときは知らせる", async () => {
    await open({
      ...createEmptyDiagram(),
      variables: [{ id: "a" as VariableId, label: "社員数", position: { x: 0, y: 0 } }],
    });
    await expect.element(page.getByText(/矢印をつないで輪を作ると/)).toBeVisible();

    const ids = ["a", "b", "c", "d", "e", "f", "g"] as VariableId[];
    const complete: Diagram = {
      ...createEmptyDiagram(),
      variables: ids.map((id, index) => ({
        id,
        label: index === 0 ? "社員数" : id,
        position: { x: index * 150, y: (index % 2) * 150 },
      })),
      links: ids.flatMap((from) =>
        ids
          .filter((to) => to !== from)
          .map((to) => ({ id: `${from}${to}` as LinkId, from, to, polarity: "+" as const })),
      ),
    };
    await open(complete);
    await expect.element(page.getByText(/ループが多すぎるため/)).toBeVisible();
  });
});

describe("変数の一覧", () => {
  const search = () => page.getByRole("searchbox", { name: "変数を名前で絞り込む" });
  /** 隠れたタブの中身は getByRole で取れないので、タブの aria-controls から辿る */
  const panel = () => {
    const tab = page.getByRole("tab", { name: /変数/ }).element();
    return document.getElementById(tab.getAttribute("aria-controls")!)!;
  };
  const rows = () => panel().querySelectorAll("li");

  it("タブで切り替え、原因と結果の数を示し、名前で絞り込み、選ぶと検査パネルに出す", async () => {
    await open();
    const tab = page.getByRole("tab", { name: /変数/ });
    await tab.click();
    await expect.element(tab).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => rows().length).toBe(7);

    await userEvent.fill(search(), "売上");
    await expect.poll(() => rows().length).toBe(1);
    await expect.element(page.getByText("原因 1 ・ 結果 2")).toBeVisible();
    await page
      .getByRole("tabpanel")
      .getByRole("button", { name: /^売上/ })
      .click();
    await expect.element(heading("変数")).toBeVisible();
    await expect.element(field("名前")).toHaveValue("売上");
    expect(panel().querySelector('[aria-current="true"]')).not.toBeNull();

    await userEvent.fill(search(), "存在しない");
    await expect.element(page.getByText("名前が一致する変数はありません")).toBeVisible();

    await page.getByRole("tab", { name: /ループ/ }).click();
    await expect.poll(() => panel().hidden).toBe(true);
    await page.getByRole("tab", { name: /変数/ }).click();
    await expect.element(search()).toHaveValue("存在しない");
  });

  it("左右の矢印キーでタブを移り、変数が無ければ足し方を案内する", async () => {
    mount(browserStartup(createEmptyDiagram()));
    (page.getByRole("tab", { name: /ループ/ }).element() as HTMLElement).focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(page.getByRole("tab", { name: /変数/ })).toHaveFocus();
    await expect.element(page.getByText(/ここに並びます/)).toBeVisible();
    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(page.getByRole("tab", { name: /ループ/ })).toHaveFocus();
  });
});

describe("読み取り専用", () => {
  it("入力欄は読み取り専用になり、操作のボタンは出さない", async () => {
    mount(
      fileStartup(
        { status: "ok", diagram: createSampleDiagram(), revision: "r" },
        { readonly: true },
      ),
    );
    await expect.element(node("社員数")).toBeVisible();
    await expect
      .element(page.getByText("変数・矢印・ループを選ぶと、ここで詳しく見られます"))
      .toBeVisible();
    nodeElement("sales").focus();
    await expect.element(field("名前")).toHaveAttribute("readonly");
    await expect.element(button(/変数を削除/)).not.toBeInTheDocument();
    (
      page.getByRole("button", { name: /^社員数から売上への関連/ }).element() as SVGGElement
    ).focus();
    await expect.element(button(/逆向きに動く/)).toBeDisabled();
    expect(notice()).toBeNull();
  });
});
