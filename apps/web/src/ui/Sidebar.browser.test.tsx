import { createEmptyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import type { Diagram, LinkId, VariableId } from "@loopcraft/core/schema";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  browserStartup,
  captureDownloads,
  cleanup,
  fileStartup,
  mount,
  node,
  nodeElement,
  notice,
  page,
  userEvent,
} from "../testing/app.tsx";

afterEach(cleanup);

async function open(diagram: Diagram = createSampleDiagram()) {
  mount(browserStartup(diagram));
  await expect.element(node("社員数")).toBeVisible();
}

const heading = (name: string) => page.getByRole("heading", { name, exact: true });
const field = (name: string | RegExp) =>
  page.getByRole("textbox", { name, exact: typeof name === "string" });
const inspector = () => page.getByRole("region", { name: "選択中の項目" });

/** ブラウザに自動保存された図 */
function stored(): Diagram {
  return JSON.parse(localStorage.getItem("loopcraft:document") ?? "null") as Diagram;
}

/** 説明を書いて保存されたこと、消すと項目ごと無くなることを確かめる */
async function writeAndClearDescription(read: (diagram: Diagram) => string | undefined) {
  await userEvent.fill(field("説明"), "メモ");
  await expect.poll(() => read(stored())).toBe("メモ");
  await userEvent.fill(field("説明"), "");
  await expect.poll(() => read(stored())).toBeUndefined();
}
const button = (name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });

describe("図の概要", () => {
  it("数を並べ、伝えたいことを書ける", async () => {
    await open();
    await expect.element(heading("図の概要")).toBeVisible();
    expect(document.querySelector(".stats")?.textContent).toContain("出来事7");
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

      // 別のタブで消されていたら、書き出せないことを知らせる
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

describe("出来事", () => {
  it("名前と説明を書き換え、原因と結果を辿って追加し、削除する", async () => {
    await open();
    nodeElement("sales").focus();
    await expect.element(heading("出来事")).toBeVisible();
    await userEvent.fill(field("名前"), "売上高");
    await expect.element(node("売上高")).toBeVisible();
    await writeAndClearDescription(
      (diagram) => diagram.variables.find((item) => item.id === "sales")?.description,
    );

    const add = page.getByRole("button", { name: "追加", exact: true });
    await expect.element(add.first()).toBeDisabled();
    await page.getByRole("combobox", { name: "原因を追加" }).selectOptions("教育コスト");
    await add.first().click();
    // 作った関連が選ばれるので、出来事を選び直す
    await expect.element(heading("関連")).toBeVisible();
    nodeElement("sales").focus();
    await page.getByRole("combobox", { name: "結果を追加" }).selectOptions("離職数");
    await add.last().click();
    await expect.element(heading("関連")).toBeVisible();
    await inspector().getByRole("button", { name: "売上高" }).click();
    await expect.element(heading("出来事")).toBeVisible();
    await expect.element(inspector().getByRole("button", { name: /教育コスト$/ })).toBeVisible();

    await inspector()
      .getByRole("button", { name: /離職数$/ })
      .click();
    await expect.element(heading("関連")).toBeVisible();
    await inspector().getByRole("button", { name: "売上高" }).click();
    await button(/出来事を削除/).click();
    await expect.element(node("売上高")).not.toBeInTheDocument();
  });

  it("繋がりの無い出来事は、無いことを示す", async () => {
    await open({
      ...createEmptyDiagram(),
      variables: [
        { id: "a" as VariableId, label: "", position: { x: 0, y: 0 } },
        { id: "b" as VariableId, label: "社員数", position: { x: 200, y: 0 } },
      ],
    });
    nodeElement("a").focus();
    await expect.element(page.getByText("この出来事に影響する矢印はありません")).toBeVisible();
    await expect.element(page.getByText("この出来事から出る矢印はありません")).toBeVisible();
    await page.getByRole("combobox", { name: "結果を追加" }).selectOptions("社員数");
    await page.getByRole("button", { name: "追加", exact: true }).last().click();
    await expect.element(inspector().getByRole("button", { name: "名称未設定" })).toBeVisible();
  });
});

describe("関連", () => {
  it("極性・遅れ・説明・曲がり具合を変え、削除する", async () => {
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
    // チェックボックスは見た目のスイッチの裏に隠しているので、ラベルを押す
    await page.getByText("遅れがある").click();
    await expect.element(page.getByRole("checkbox", { name: /遅れがある/ })).toBeChecked();
    await page.getByText("遅れがある").click();
    await expect.element(page.getByRole("checkbox", { name: /遅れがある/ })).not.toBeChecked();
    await writeAndClearDescription(
      (diagram) => diagram.links.find((item) => item.id === "l_sales")?.description,
    );
    await button("曲がり具合を戻す").click();
    await expect.element(button("曲がり具合を戻す")).toBeDisabled();
    await button(/関連を削除/).click();
    await expect.element(heading("図の概要")).toBeVisible();
    expect(document.querySelector('[aria-label^="社員数から売上への関連"]')).toBeNull();
  });

  it("両端の出来事に移れ、名前が無ければ「名称未設定」と示す", async () => {
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
    await inspector()
      .getByRole("button", { name: /見出しを外す/ })
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

  it("種類で絞り込み、見出していないループは選ぶと強調し、ピンで見出す", async () => {
    await open();
    const items = () => document.querySelectorAll(".loop-item");
    await page.getByRole("radio", { name: /バランス B/ }).click();
    await expect.poll(() => items().length).toBe(2);
    expect(document.querySelectorAll(".loop-item.balancing")).toHaveLength(2);
    await page.getByRole("radio", { name: /自己強化 R/ }).click();
    await expect.poll(() => document.querySelectorAll(".loop-item.reinforcing").length).toBe(2);
    expect(items()).toHaveLength(2);
    await page.getByRole("radio", { name: /すべて/ }).click();

    const plain = document.querySelector(".loop-item:not(.featured) .loop-item-main")!;
    await page.elementLocator(plain).click();
    await expect.poll(() => document.querySelector(".loop-item.active")).not.toBeNull();
    await page.elementLocator(plain).click();
    await userEvent.unhover(page.elementLocator(plain));
    await expect.poll(() => document.querySelector(".loop-item.active")).toBeNull();

    await page.elementLocator(document.querySelector(".loop-item:not(.featured) .pin")!).click();
    await expect.poll(() => document.querySelectorAll(".loop-item.featured").length).toBe(4);
  });

  it("ループが無いときや、その種類が無いときは案内し、多すぎるときは知らせる", async () => {
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
    await page.getByRole("radio", { name: /バランス B/ }).click();
    await expect.element(page.getByText("この種類のループはありません")).toBeVisible();
  });
});

describe("閲覧モード", () => {
  it("入力欄は読み取り専用になり、操作のボタンは出さない", async () => {
    mount(fileStartup({ status: "ok", diagram: createSampleDiagram(), revision: "r" }));
    await expect.element(node("社員数")).toBeVisible();
    await expect
      .element(page.getByText("出来事・矢印・ループを選ぶと、ここで詳しく見られます"))
      .toBeVisible();
    nodeElement("sales").focus();
    await expect.element(field("名前")).toHaveAttribute("readonly");
    expect(document.querySelector(".relation-picker")).toBeNull();
    await expect.element(button(/出来事を削除/)).not.toBeInTheDocument();
    (
      page.getByRole("button", { name: /^社員数から売上への関連/ }).element() as SVGGElement
    ).focus();
    await expect.element(button(/逆向きに動く/)).toBeDisabled();
    expect(notice()).toBeNull();
  });
});
