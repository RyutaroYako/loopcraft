import { describe, expect, it, vi } from "vite-plus/test";
import {
  addLink,
  createId,
  featureLoop,
  moveVariables,
  removeLoop,
  removeVariable,
  setDescription,
  setTitle,
  togglePolarity,
  updateLink,
  updateLoop,
  updateVariable,
} from "./edit.ts";
import type { LinkId, LoopId, VariableId } from "./schema.ts";
import { createSample } from "./testing/sample.ts";

const vid = (id: string) => id as VariableId;
const lid = (id: string) => id as LinkId;
const pid = (id: string) => id as LoopId;

describe("edit（図全体とループ）", () => {
  it("タイトルと説明を変え、同じ値なら同じ図を返す", () => {
    const sample = createSample();
    expect(setTitle(sample, sample.title)).toBe(sample);
    expect(setTitle(sample, "新しい題").title).toBe("新しい題");
    const described = setDescription(sample, "メモ");
    expect(described.description).toBe("メモ");
    expect(setDescription(described, "")).not.toHaveProperty("description");
  });

  it("新しいループを見出し、名前や記号の位置を変え、外せる", () => {
    const sample = createSample();
    const base = { ...sample, loops: [] };
    const { diagram, id } = featureLoop(base, [lid("l1"), lid("l2"), lid("l3"), lid("l4")], {
      name: "育成",
    });
    expect(diagram.loops).toEqual([{ id, name: "育成", links: ["l1", "l2", "l3", "l4"] }]);
    const renamed = updateLoop(diagram, id, { name: "改名", marker: { x: 1, y: 2 } });
    expect(renamed.loops[0]).toMatchObject({ name: "改名", marker: { x: 1, y: 2 } });
    expect(updateLoop(renamed, id, { marker: undefined }).loops[0]).not.toHaveProperty("marker");
    expect(removeLoop(renamed, id).loops).toEqual([]);
    expect(
      featureLoop(base, [lid("l1"), lid("l2"), lid("l3"), lid("l4")]).diagram.loops[0]!.name,
    ).toBe("");
  });

  it("見つからない対象への編集は元の図を返す", () => {
    const sample = createSample();
    expect(updateVariable(sample, vid("ghost"), { label: "x" })).toBe(sample);
    expect(updateLink(sample, lid("ghost"), { polarity: "-" })).toBe(sample);
    expect(updateLoop(sample, pid("ghost"), { name: "x" })).toBe(sample);
    expect(removeLoop(sample, pid("ghost"))).toBe(sample);
    expect(removeVariable(sample, vid("ghost"))).toBe(sample);
    expect(togglePolarity(sample, lid("ghost"))).toBe(sample);
    expect(moveVariables(sample, new Map([[vid("ghost"), { x: 1, y: 1 }]]))).toBe(sample);
  });

  it("出来事を動かすと位置が変わる", () => {
    const moved = moveVariables(createSample(), new Map([[vid("staff"), { x: 5, y: 6 }]]));
    expect(moved.variables[0]!.position).toEqual({ x: 5, y: 6 });
  });

  it("存在しない出来事への関連は作れない", () => {
    expect(addLink(createSample(), { from: vid("staff"), to: vid("ghost") })).toEqual({
      ok: false,
      reason: "unknown-variable",
    });
  });

  it("使われている ID を避けて作り直す", () => {
    const random = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementationOnce((array) => array)
      .mockImplementationOnce((array) => {
        (array as Uint8Array).fill(1);
        return array;
      });
    const id = createId("v", new Set(["v_000000"]));
    expect(id).toBe("v_111111");
    random.mockRestore();
  });
});
