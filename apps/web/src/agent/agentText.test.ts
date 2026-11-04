import { describe, expect, it } from "vite-plus/test";
import { agentTurn } from "../testing/agent.ts";
import { blocksOf, elapsedText } from "./agentText.ts";

describe("blocksOf", () => {
  it("返答の文の間に続けて並ぶ作業を、1 つの一覧にまとめる", () => {
    const blocks = blocksOf([
      { kind: "text", text: "足します" },
      { kind: "read", path: "README.md" },
      { kind: "changes", changes: [{ kind: "variable-added", label: "面談の回数" }] },
      { kind: "checked", loops: { R: 1, B: 2 }, errors: 1 },
      { kind: "text", text: "足しました" },
    ]);
    expect(blocks).toEqual([
      { kind: "text", key: "0", text: "足します" },
      {
        kind: "steps",
        key: "1",
        rows: [
          { kind: "note", action: "ファイルを読む", text: "README.md", key: "1-0" },
          { kind: "variable", action: "変数を追加", label: "面談の回数", key: "2-0" },
          {
            kind: "note",
            action: "確かめた",
            text: "ループ R 1・B 2、配置の崩れ 1 件",
            key: "3-0",
          },
        ],
      },
      { kind: "text", key: "4", text: "足しました" },
    ]);
  });

  it("変更の種類ごとに、何をしたかと対象を並べる", () => {
    const link = { from: "離職数", to: "社員数", polarity: "-" as const };
    const [block] = blocksOf([
      {
        kind: "changes",
        changes: [
          { kind: "variable-removed", label: "採用数" },
          { kind: "variable-renamed", before: "売上", after: "月の売上" },
          { kind: "variables-moved", count: 3 },
          { kind: "link-changed", ...link },
          { kind: "link-removed", ...link },
          { kind: "loop-featured", name: "成長" },
          { kind: "loop-unfeatured", name: "疲弊" },
          { kind: "title-changed", title: "組織" },
          { kind: "details-changed", count: 2 },
        ],
      },
      { kind: "checked", loops: { R: 1, B: 0 }, errors: 0 },
    ]);
    const rows = block?.kind === "steps" ? block.rows : [];
    expect(rows).toMatchObject([
      { kind: "variable", action: "変数を削除", label: "採用数" },
      { kind: "rename", action: "名前を変更", before: "売上", after: "月の売上" },
      { kind: "note", action: "配置を変更", text: "変数 3 個" },
      { kind: "link", action: "関連を変更", ...link },
      { kind: "link", action: "関連を削除", ...link },
      { kind: "note", action: "ループに注目", text: "成長" },
      { kind: "note", action: "注目から外す", text: "疲弊" },
      { kind: "note", action: "題名を変更", text: "組織" },
      { kind: "note", action: "説明などを変更", text: "2 か所" },
      { kind: "note", action: "確かめた", text: "ループ R 1・B 0、配置の崩れなし" },
    ]);
  });
});

describe("elapsedText", () => {
  it("終わった指示にかかった時間を、秒か分と秒で表す", () => {
    expect(elapsedText(agentTurn())).toBeUndefined();
    expect(elapsedText(agentTurn({ startedAt: 0, endedAt: 18_400 }))).toBe("18 秒");
    expect(elapsedText(agentTurn({ startedAt: 0, endedAt: 200 }))).toBe("1 秒");
    expect(elapsedText(agentTurn({ startedAt: 0, endedAt: 65_000 }))).toBe("1 分 5 秒");
  });
});
