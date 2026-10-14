import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import {
  addLink,
  addVariable,
  featureLoop,
  moveVariables,
  removeLinks,
  removeVariable,
  togglePolarity,
  updateLink,
  updateVariable,
} from "./edit.ts";
import { DiagramSchema, type LinkId, type VariableId } from "./schema.ts";
import { createSample } from "./testing/sample.ts";

const vid = (id: string) => id as VariableId;
const lid = (id: string) => id as LinkId;

/** 編集結果が常にスキーマの整合性を満たすことを確かめる */
function expectValid(diagram: unknown) {
  expect(v.safeParse(DiagramSchema, diagram).issues).toBeUndefined();
}

describe("edit", () => {
  it("変数を追加すると重複しない ID が振られる", () => {
    const sample = createSample();
    const { diagram, id } = addVariable(sample, { label: "離職率", position: { x: 1, y: 2 } });
    expect(diagram.variables.at(-1)).toEqual({ id, label: "離職率", position: { x: 1, y: 2 } });
    expect(sample.variables).toHaveLength(5);
    expectValid(diagram);
  });

  it("変更が無ければ同じ図を返す", () => {
    const sample = createSample();
    expect(updateVariable(sample, vid("staff"), { label: "社員数" })).toBe(sample);
    expect(moveVariables(sample, new Map([[vid("staff"), { x: 0, y: 0 }]]))).toBe(sample);
  });

  it("空の説明は項目ごと消す", () => {
    const sample = createSample();
    const described = updateVariable(sample, vid("staff"), { description: "正社員のみ" });
    expect(described.variables[0]!.description).toBe("正社員のみ");
    const cleared = updateVariable(described, vid("staff"), { description: undefined });
    expect(cleared.variables[0]).not.toHaveProperty("description");
  });

  it("変数を消すと繋がる関連とループも消える", () => {
    const diagram = removeVariable(createSample(), vid("sales"));
    expect(diagram.links.map((link) => link.id)).toEqual(["l1", "l2", "l3", "l4"]);
    expect(diagram.loops.map((loop) => loop.id)).toEqual(["b1"]);
    expectValid(diagram);
  });

  it("関連を消すとそれを通るループも消える", () => {
    const diagram = removeLinks(createSample(), new Set([lid("l3")]));
    expect(diagram.loops).toEqual([]);
    expectValid(diagram);
  });

  it("自己ループと重複した関連は作れない", () => {
    const sample = createSample();
    expect(addLink(sample, { from: vid("staff"), to: vid("staff") })).toMatchObject({
      ok: false,
      reason: "self",
    });
    expect(addLink(sample, { from: vid("staff"), to: vid("training") })).toEqual({
      ok: false,
      reason: "duplicate",
      existing: "l1",
    });
  });

  it("逆向きの関連は作れる", () => {
    const result = addLink(createSample(), { from: vid("training"), to: vid("staff") });
    expect(result.ok).toBe(true);
    if (result.ok) expectValid(result.diagram);
  });

  it("極性を反転できる", () => {
    const diagram = togglePolarity(createSample(), lid("l2"));
    expect(diagram.links[1]!.polarity).toBe("+");
  });

  it("曲がり具合を既定に戻すと項目が消える", () => {
    const curved = updateLink(createSample(), lid("l1"), { curvature: 0.4 });
    expect(curved.links[0]!.curvature).toBe(0.4);
    expect(updateLink(curved, lid("l1"), { curvature: undefined }).links[0]).not.toHaveProperty(
      "curvature",
    );
  });

  it("回転違いのループは二重に登録しない", () => {
    const sample = createSample();
    const result = featureLoop(sample, [lid("l3"), lid("l4"), lid("l1"), lid("l2")]);
    expect(result.diagram).toBe(sample);
    expect(result.id).toBe("b1");
  });
});
