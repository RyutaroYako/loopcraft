import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { findLoops } from "./cycles.ts";
import { cycleKey } from "./loop.ts";
import { DiagramShapeSchema, type DiagramShape } from "./schema.ts";
import { createSample } from "./testing/sample.ts";

function graph(edges: [string, string, "+" | "-"][]): DiagramShape {
  const names = [...new Set(edges.flatMap(([from, to]) => [from, to]))];
  return v.parse(DiagramShapeSchema, {
    version: 1,
    title: "",
    variables: names.map((id) => ({ id, label: id, position: { x: 0, y: 0 } })),
    links: edges.map(([from, to, polarity]) => ({ id: `${from}${to}`, from, to, polarity })),
    loops: [],
  });
}

describe("findLoops", () => {
  it("サンプルの 2 つのループを種類つきで見つける", () => {
    const { loops, truncated } = findLoops(createSample());
    expect(truncated).toBe(false);
    expect(loops.map((loop) => [loop.key, loop.kind])).toEqual(
      [
        [cycleKey(["l1", "l2", "l3", "l4"] as never), "balancing"],
        [cycleKey(["l5", "l6", "l3", "l4"] as never), "reinforcing"],
      ].sort((a, b) => (a[0]! < b[0]! ? -1 : 1)),
    );
  });

  it("出来事の並びは関連の出発点と対応する", () => {
    const { loops } = findLoops(
      graph([
        ["a", "b", "+"],
        ["b", "c", "+"],
        ["c", "a", "-"],
      ]),
    );
    expect(loops).toHaveLength(1);
    const [loop] = loops;
    expect(loop!.links).toEqual(["ab", "bc", "ca"]);
    expect(loop!.variables).toEqual(["a", "b", "c"]);
    expect(loop!.kind).toBe("balancing");
  });

  it("閉路が無ければ空", () => {
    expect(
      findLoops(
        graph([
          ["a", "b", "+"],
          ["b", "c", "+"],
        ]),
      ).loops,
    ).toEqual([]);
  });

  it("往復の関連も 2 本のループとして扱う", () => {
    const { loops } = findLoops(
      graph([
        ["a", "b", "-"],
        ["b", "a", "-"],
      ]),
    );
    expect(loops.map((loop) => loop.kind)).toEqual(["reinforcing"]);
  });

  it("完全グラフの閉路をすべて重複なく列挙する", () => {
    const names = ["a", "b", "c", "d"];
    const edges = names.flatMap((from) =>
      names.filter((to) => to !== from).map((to) => [from, to, "+"] as [string, string, "+"]),
    );
    const { loops } = findLoops(graph(edges));
    // K4 の有向単純閉路: 長さ2が6, 長さ3が8, 長さ4が6
    expect(loops).toHaveLength(20);
    expect(new Set(loops.map((loop) => loop.key)).size).toBe(20);
    expect(loops.map((loop) => loop.links.length)).toEqual(
      loops.map((l) => l.links.length).toSorted((a, b) => a - b),
    );
  });

  it("上限に達したら打ち切りを知らせる", () => {
    const names = ["a", "b", "c", "d"];
    const edges = names.flatMap((from) =>
      names.filter((to) => to !== from).map((to) => [from, to, "+"] as [string, string, "+"]),
    );
    const result = findLoops(graph(edges), 5);
    expect(result.truncated).toBe(true);
    expect(result.loops).toHaveLength(5);
  });
});
