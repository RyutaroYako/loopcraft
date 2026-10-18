import { describe, expect, it } from "vite-plus/test";
import { formatDiagramError, parseDiagramJson } from "./io.ts";
import { createSampleInput } from "./testing/sample.ts";

const parse = (input: unknown) => parseDiagramJson(JSON.stringify(input));
const errorsOf = (input: unknown) => {
  const result = parse(input);
  if (result.ok) throw new Error("valid");
  return result.errors;
};

describe("parseDiagramJson のエラー", () => {
  it("知らないキーはエラーにし、近いキーを示す", () => {
    const input = createSampleInput();
    Object.assign(input.links[0]!, { polarty: "+" });
    Object.assign(input.variables[0]!, { colour: "red" });
    Object.assign(input, { extra: 1 });
    expect(errorsOf(input)).toEqual(
      expect.arrayContaining([
        {
          path: "links.0.polarty",
          message: '知らないキー "polarty" です',
          hint: '"polarity" のことですか',
        },
        {
          path: "variables.0.colour",
          message: '知らないキー "colour" です',
          hint: "書けるキーは id, label, description, position です",
        },
        expect.objectContaining({ path: "extra", message: '知らないキー "extra" です' }),
      ]),
    );
  });

  it("座標の知らないキーには座標のキーを示す", () => {
    const input = createSampleInput();
    Object.assign(input.variables[0]!.position, { z: 1 });
    expect(errorsOf(input)).toEqual([
      {
        path: "variables.0.position.z",
        message: '知らないキー "z" です',
        hint: "書けるキーは x, y です",
      },
    ]);
  });

  it("足りないキーを名前で伝える", () => {
    const input = createSampleInput();
    delete (input.links[0] as { polarity?: string }).polarity;
    expect(errorsOf(input)).toContainEqual({ path: "links.0", message: '"polarity" がありません' });
    expect(errorsOf({ version: 1, variables: [], links: [], loops: [] })).toEqual([
      { path: undefined, message: '"title" がありません' },
    ]);
  });

  it("形の誤りがあっても、読める部分の参照切れを一緒に挙げる", () => {
    const input = createSampleInput();
    Object.assign(input.links[0]!, { polarity: "plus" });
    input.links[1]!.to = "社員数";
    input.links[2]!.to = "sale";
    expect(errorsOf(input)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "links.0.polarity" }),
        {
          path: "links.1.to",
          message: '変数 "社員数" は存在しません',
          hint: '変数は ID で指します。"社員数" の ID は "staff" です',
        },
        { path: "links.2.to", message: '変数 "sale" は存在しません', hint: '"sales" のことですか' },
      ]),
    );
  });

  it("形の合わない項目を外して調べても、元の位置で報告し、外した関連を参照切れにしない", () => {
    const input = createSampleInput();
    const variables = input.variables as unknown[];
    variables.unshift({ label: "ID の無い変数" });
    delete (input.links[0] as { to?: string }).to;
    input.links[5]!.from = "ghost";
    input.loops[1]!.links = ["l5", "staff"];
    const errors = errorsOf(input);
    expect(errors).toContainEqual(expect.objectContaining({ path: "links.5.from" }));
    expect(errors).toContainEqual({
      path: "loops.1.links.1",
      message: '関連 "staff" は存在しません',
      hint: "loops の links には、変数ではなく関連の ID を並べます",
    });
    expect(errors.filter((error) => error.path?.startsWith("loops.0"))).toEqual([]);
    expect(parse({ variables: "x" }).ok).toBe(false);
    expect(parse([]).ok).toBe(false);
  });

  it("ループの並びの誤りに直し方を添える", () => {
    const input = createSampleInput();
    input.loops[0]!.links = ["l1", "l3", "l2", "l4"];
    input.loops[1]!.links = ["l5", "l6", "l3", "l9"];
    input.links.push({ id: "l7", from: "staff", to: "profit", polarity: "+" });
    input.links.push({ id: "l8", from: "profit", to: "staff", polarity: "+" });
    input.loops.push({ id: "x", name: "", links: ["l7", "l8", "l7", "l8"] });
    const errors = errorsOf(input);
    expect(errors).toContainEqual(
      expect.objectContaining({
        path: "loops.0.links.0",
        hint: expect.stringContaining('次には "training" から出る関連を置きます'),
      }),
    );
    // 2 文字の ID は、1 文字違うだけで別の関連なので、候補を出さない
    expect(errors).toContainEqual({ path: "loops.1.links.3", message: '関連 "l9" は存在しません' });
    expect(errors).toContainEqual(
      expect.objectContaining({ path: "loops.2.links.2", message: "同じ変数を 2 回通っています" }),
    );
  });

  it("同じ向きの関連の重複には、既にある関連を書き換えるよう示す", () => {
    const input = createSampleInput();
    input.links.push({ id: "dup", from: "staff", to: "training", polarity: "-" });
    expect(errorsOf(input)).toContainEqual(
      expect.objectContaining({
        path: "links.6",
        hint: expect.stringContaining('"l1" の polarity'),
      }),
    );
  });

  it("エラーを場所と直し方つきの 1 行にする", () => {
    expect(formatDiagramError({ path: "a.b", message: "m", hint: "h" })).toBe("a.b: m（h）");
    expect(formatDiagramError({ path: undefined, message: "m" })).toBe("m");
  });
});

describe("parseDiagramJson の座標", () => {
  it("座標の無い変数を配置して読み込み、どれを配置したかを返す", () => {
    const input = createSampleInput();
    delete (input.variables[4] as { position?: unknown }).position;
    const result = parse(input);
    expect(result.ok && result.unplaced).toEqual(["hiring"]);
    expect(result.ok && result.diagram.variables[4]!.position).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
    });
  });
});
