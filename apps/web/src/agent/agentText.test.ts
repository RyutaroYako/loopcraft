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
});

describe("elapsedText", () => {
  it("終わった指示にかかった時間を、秒か分と秒で表す", () => {
    expect(elapsedText(agentTurn())).toBeUndefined();
    expect(elapsedText(agentTurn({ startedAt: 0, endedAt: 18_400 }))).toBe("18 秒");
    expect(elapsedText(agentTurn({ startedAt: 0, endedAt: 200 }))).toBe("1 秒");
    expect(elapsedText(agentTurn({ startedAt: 0, endedAt: 65_000 }))).toBe("1 分 5 秒");
  });
});
