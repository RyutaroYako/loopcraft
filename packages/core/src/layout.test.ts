import { describe, expect, it } from "vite-plus/test";
import { estimateNodeSizes, nodeSize } from "./geometry.ts";
import type { Size } from "./geometry.ts";
import { autoLayout, placeMissingVariables } from "./layout.ts";
import { findLayoutIssues, polylinesCross } from "./layout-check.ts";
import { createSampleDiagram } from "./sample.ts";
import type { Diagram, DiagramShape, LinkId, LoopId, VariableId } from "./schema.ts";

const sizesOf = (diagram: Diagram): Map<VariableId, Size> => {
  return new Map(
    diagram.variables.map((variable) => [variable.id, nodeSize(variable.label.length * 14)]),
  );
};

const stacked = (): Diagram => {
  const sample = createSampleDiagram();
  return {
    ...sample,
    variables: sample.variables.map((variable) => ({ ...variable, position: { x: 0, y: 0 } })),
  };
};

describe("autoLayout", () => {
  it("変数の枠が重ならないように配置する", () => {
    const diagram = stacked();
    const sizes = sizesOf(diagram);
    const result = autoLayout(diagram, sizes);
    const boxes = result.variables.map((variable) => ({
      ...variable.position,
      ...sizes.get(variable.id)!,
    }));
    for (const [index, a] of boxes.entries()) {
      for (const b of boxes.slice(index + 1)) {
        const apartX = Math.abs(a.x - b.x) >= (a.width + b.width) / 2;
        const apartY = Math.abs(a.y - b.y) >= (a.height + b.height) / 2;
        expect(apartX || apartY).toBe(true);
      }
    }
  });

  it("同じ図からは毎回同じ配置になり、重心は動かさない", () => {
    const diagram = createSampleDiagram();
    const sizes = sizesOf(diagram);
    const first = autoLayout(diagram, sizes);
    expect(autoLayout(diagram, sizes)).toEqual(first);
    const center = (target: Diagram) => {
      const xs = target.variables.map((variable) => variable.position.x);
      const ys = target.variables.map((variable) => variable.position.y);
      return {
        x: xs.reduce((sum, x) => sum + x, 0) / xs.length,
        y: ys.reduce((sum, y) => sum + y, 0) / ys.length,
      };
    };
    expect(center(first).x).toBeCloseTo(center(diagram).x, 0);
    expect(center(first).y).toBeCloseTo(center(diagram).y, 0);
  });

  it("動かした変数につながる曲がり具合を既定に戻し、ループ記号を変数から離して置き直す", () => {
    const sample = stacked();
    const diagram: Diagram = {
      ...sample,
      links: sample.links.map((link) => ({ ...link, curvature: 0.4 })),
      loops: sample.loops.map((loop) => ({ ...loop, marker: { x: 1, y: 2 } })),
    };
    const sizes = sizesOf(diagram);
    const result = autoLayout(diagram, sizes);
    expect(result.links.every((link) => !("curvature" in link))).toBe(true);
    for (const loop of result.loops) {
      const marker = loop.marker!;
      expect(marker).not.toEqual({ x: 1, y: 2 });
      for (const variable of result.variables) {
        const size = sizes.get(variable.id)!;
        const dx = Math.abs(marker.x - variable.position.x) - size.width / 2;
        const dy = Math.abs(marker.y - variable.position.y) - size.height / 2;
        // 記号の半径 26 より離れている
        expect(Math.max(dx, dy)).toBeGreaterThan(26);
      }
    }
  });

  it("整列済みの図をもう一度整列しても、何も変えない", () => {
    const diagram = stacked();
    const sizes = sizesOf(diagram);
    const once = autoLayout(diagram, sizes);
    expect(autoLayout(once, sizes)).toBe(once);
  });

  it("重なりも交差も無い図は、手で置いた並びのまま動かさない", () => {
    const diagram = createSampleDiagram();
    expect(autoLayout(diagram, sizesOf(diagram)).variables).toEqual(diagram.variables);
  });

  it("変数を 1 つ足して並べ直しても、ほかの変数の並びを大きく変えない", () => {
    const once = autoLayout(stacked(), sizesOf(stacked()));
    const staff = once.variables.find((variable) => variable.id === "staff")!;
    const grown: Diagram = {
      ...once,
      variables: [
        ...once.variables,
        {
          id: "morale" as VariableId,
          label: "士気",
          // 画面では空いた所に足すので、図の外に置く
          position: {
            x: Math.min(...once.variables.map((item) => item.position.x)) - 200,
            y: staff.position.y,
          },
        },
      ],
      links: [
        ...once.links,
        {
          id: "l_morale" as LinkId,
          from: "staff" as VariableId,
          to: "morale" as VariableId,
          polarity: "+",
        },
      ],
    };
    const result = autoLayout(grown, sizesOf(grown));
    const before = new Map(once.variables.map((variable) => [variable.id, variable.position]));
    const moved = result.variables
      .filter((variable) => before.has(variable.id))
      .map((variable) => {
        const old = before.get(variable.id)!;
        return Math.hypot(variable.position.x - old.x, variable.position.y - old.y);
      });
    // 一から組み直すと、どの変数も 200px ほど動く
    expect(moved.reduce((sum, length) => sum + length, 0) / moved.length).toBeLessThan(100);
  });

  it("大きさの分からない変数は名前が空のときの大きさとみなし、変数が 1 つなら重心に置く", () => {
    const sample = createSampleDiagram();
    const single = { ...sample, variables: sample.variables.slice(0, 1), links: [], loops: [] };
    const result = autoLayout(single, new Map());
    expect(result.variables[0]!.position).toEqual(single.variables[0]!.position);
    expect(autoLayout(stacked(), new Map()).variables).toHaveLength(sample.variables.length);
  });

  it("ばねだけでは離しきれない大きな変数も、縦横どちらへも押し広げて重ならないようにする", () => {
    const diagram = createSampleDiagram();
    for (const size of [
      { width: 900, height: 36 },
      { width: 72, height: 2000 },
    ]) {
      const result = autoLayout(diagram, new Map(diagram.variables.map((item) => [item.id, size])));
      const positions = result.variables.map((variable) => variable.position);
      for (const [index, p] of positions.entries()) {
        for (const q of positions.slice(index + 1)) {
          const apart = Math.abs(p.x - q.x) >= size.width || Math.abs(p.y - q.y) >= size.height;
          expect(apart).toBe(true);
        }
      }
    }
  });

  it("逆向きの関連があっても配置できる", () => {
    const sample = stacked();
    const first = sample.links[0]!;
    const reversed = { ...first, id: "reverse" as LinkId, from: first.to, to: first.from };
    const diagram = { ...sample, links: [...sample.links, reversed] };
    const result = autoLayout(diagram, sizesOf(diagram));
    expect(result.loops.every((loop) => loop.marker !== undefined)).toBe(true);
  });

  it("空の図はそのまま返す", () => {
    const diagram = { ...createSampleDiagram(), variables: [], links: [], loops: [] };
    expect(autoLayout(diagram, new Map())).toBe(diagram);
  });

  it("動かさない変数を指定すると、その変数の位置と、その変数どうしの曲がり具合を保つ", () => {
    const sample = createSampleDiagram();
    const diagram: Diagram = {
      ...sample,
      links: sample.links.map((link) => ({ ...link, curvature: 0.3 })),
    };
    const fixed = new Set(["staff", "sales", "profit"] as VariableId[]);
    const result = autoLayout(diagram, sizesOf(diagram), { fixed });
    for (const variable of diagram.variables.filter((item) => fixed.has(item.id))) {
      expect(result.variables.find((item) => item.id === variable.id)!.position).toEqual(
        variable.position,
      );
    }
    const between = result.links.find((link) => link.from === "staff" && link.to === "sales")!;
    expect(between.curvature).toBe(0.3);
    const touching = result.links.find((link) => link.from === "profit" && link.to === "hiring")!;
    expect(touching.curvature).toBeUndefined();
  });

  it("すべて動かさないなら、何も変えない", () => {
    const diagram = createSampleDiagram();
    const fixed = new Set(diagram.variables.map((variable) => variable.id));
    expect(autoLayout(diagram, sizesOf(diagram), { fixed })).toBe(diagram);
  });

  const line = (labels: string[], links: [string, string][]): Diagram => ({
    version: 1,
    title: "",
    variables: labels.map((id, at) => ({
      id: id as VariableId,
      label: id,
      position: { x: at * 200, y: 0 },
    })),
    links: links.map(([from, to]) => ({
      id: `${from}-${to}` as LinkId,
      from: from as VariableId,
      to: to as VariableId,
      polarity: "+",
    })),
    loops: [],
  });
  const throughs = (diagram: Diagram, sizes: ReadonlyMap<VariableId, Size>) =>
    findLayoutIssues(diagram, sizes).filter((issue) => issue.kind === "link-through");

  it("変数を突き抜ける矢印は、曲げて逃がす", () => {
    const diagram = line(
      ["a", "b", "c", "d"],
      [
        ["a", "c"],
        ["c", "d"],
      ],
    );
    const sizes = sizesOf(diagram);
    const fixed = new Set(["a", "b", "c"] as VariableId[]);
    expect(throughs(diagram, sizes)).toHaveLength(1);
    const result = autoLayout(diagram, sizes, { fixed });
    expect(result.links.find((link) => link.id === "a-c")!.curvature).toBeDefined();
    expect(throughs(result, sizes)).toEqual([]);
  });

  it("逆向きの関連と対になった矢印は、対の矢印から離れる向きにだけ曲げる", () => {
    const diagram = line(
      ["a", "b", "c", "d"],
      [
        ["a", "c"],
        ["c", "a"],
        ["c", "d"],
      ],
    );
    // 対の矢印は既定でも曲がっているので、それでは逃げきれない高さにする
    const sizes = new Map(sizesOf(diagram));
    sizes.set("b" as VariableId, { width: 72, height: 200 });
    const result = autoLayout(diagram, sizes, { fixed: new Set(["a", "b", "c"] as VariableId[]) });
    for (const id of ["a-c", "c-a"]) {
      expect(result.links.find((link) => link.id === id)!.curvature).toBeGreaterThan(0.18);
    }
  });

  it("今の並びを残すときも、手で曲げた矢印の突き抜けと、変数に重なった記号は直す", () => {
    const diagram: Diagram = {
      version: 1,
      title: "",
      variables: [
        { id: "a" as VariableId, label: "a", position: { x: 0, y: 0 } },
        { id: "b" as VariableId, label: "b", position: { x: 400, y: 0 } },
        { id: "c" as VariableId, label: "c", position: { x: 200, y: 150 } },
        { id: "d" as VariableId, label: "d", position: { x: 200, y: -300 } },
      ],
      links: [
        {
          id: "ab" as LinkId,
          from: "a" as VariableId,
          to: "b" as VariableId,
          polarity: "+",
          curvature: -0.4,
        },
        { id: "bc" as LinkId, from: "b" as VariableId, to: "c" as VariableId, polarity: "+" },
        { id: "ca" as LinkId, from: "c" as VariableId, to: "a" as VariableId, polarity: "+" },
        { id: "ad" as LinkId, from: "a" as VariableId, to: "d" as VariableId, polarity: "+" },
      ],
      loops: [
        {
          id: "p" as LoopId,
          name: "",
          links: ["ab", "bc", "ca"] as LinkId[],
          marker: { x: 0, y: 0 },
        },
      ],
    };
    const sizes = sizesOf(diagram);
    const kinds = (target: Diagram) => findLayoutIssues(target, sizes).map((issue) => issue.kind);
    expect(kinds(diagram)).toEqual(expect.arrayContaining(["link-through", "marker-overlap"]));
    const result = autoLayout(diagram, sizes);
    expect(result.variables).toEqual(diagram.variables);
    expect(kinds(result)).not.toContain("link-through");
    expect(kinds(result)).not.toContain("marker-overlap");
  });

  it("どう曲げても突き抜ける矢印は、曲げずに残す", () => {
    const diagram = line(
      ["a", "b", "c", "d"],
      [
        ["a", "c"],
        ["c", "d"],
      ],
    );
    const sizes = new Map(sizesOf(diagram));
    sizes.set("b" as VariableId, { width: 72, height: 5000 });
    const result = autoLayout(diagram, sizes, { fixed: new Set(["a", "b", "c"] as VariableId[]) });
    expect(result.links.find((link) => link.id === "a-c")!.curvature).toBeUndefined();
  });

  it("ループの変数を、矢印が自分と交わらない輪の形に並べる", () => {
    const loop = (id: string, members: string[]) => ({
      id: id as LoopId,
      name: id,
      links: members.map((from, at) => `${from}-${members[(at + 1) % members.length]}` as LinkId),
    });
    // 力学モデルでは、1 つ目と 2 つ目のどちらかが 8 の字にねじれた形
    const rings = [
      ["a", "b", "c", "d", "e", "f"],
      ["a", "b", "g", "h", "i", "j"],
      ["a", "k", "l", "m"],
    ];
    const diagram: Diagram = {
      ...line(
        [...new Set(rings.flat())],
        rings
          .flatMap((members) =>
            members.map(
              (from, at) => [from, members[(at + 1) % members.length]!] as [string, string],
            ),
          )
          .filter(
            ([from, to], at, all) => all.findIndex(([f, t]) => f === from && t === to) === at,
          ),
      ),
      loops: rings.map((members, at) => loop(`p${at}`, members)),
    };
    const result = autoLayout(diagram, sizesOf(diagram));
    const position = new Map(result.variables.map((variable) => [variable.id, variable.position]));
    const fromByLink = new Map(result.links.map((link) => [link.id, link.from]));
    for (const loop of result.loops) {
      const ring = loop.links.map((link) => position.get(fromByLink.get(link)!)!);
      for (let i = 0; i < ring.length; i++) {
        for (let j = i + 2; j < ring.length; j++) {
          if (i === 0 && j === ring.length - 1) continue;
          const crossed = polylinesCross(
            [ring[i]!, ring[(i + 1) % ring.length]!],
            [ring[j]!, ring[(j + 1) % ring.length]!],
          );
          expect(crossed).toBe(false);
        }
      }
    }
  });

  it("繋がっていない変数や、同じ位置に重なった変数があっても並べられる", () => {
    const diagram = line(["a", "b", "c"], [["a", "b"]]);
    const piled = {
      ...diagram,
      variables: diagram.variables.map((variable) => ({ ...variable, position: { x: 0, y: 0 } })),
    };
    const fixed = new Set(["a"] as VariableId[]);
    const sizes = sizesOf(piled);
    for (const result of [autoLayout(piled, sizes), autoLayout(piled, sizes, { fixed })]) {
      expect(findLayoutIssues(result, sizes).filter((issue) => issue.kind === "overlap")).toEqual(
        [],
      );
    }
  });
});

describe("placeMissingVariables", () => {
  const withoutPositions = (ids: string[]): DiagramShape => {
    const sample = createSampleDiagram();
    return {
      ...sample,
      variables: sample.variables.map(({ position, ...variable }) =>
        ids.includes(variable.id) ? variable : { ...variable, position },
      ),
    };
  };

  it("座標の無い変数だけを、ほかの変数と重ならないように置く", () => {
    const shape = withoutPositions(["hiring", "attrition"]);
    const result = placeMissingVariables(shape);
    const sizes = estimateNodeSizes(result.variables);
    for (const variable of shape.variables.filter((item) => item.position)) {
      expect(result.variables.find((item) => item.id === variable.id)!.position).toEqual(
        variable.position,
      );
    }
    expect(findLayoutIssues(result, sizes).filter((issue) => issue.kind === "overlap")).toEqual([]);
  });

  it("どの変数にも座標が無ければ、図全体を並べる", () => {
    const shape = withoutPositions(createSampleDiagram().variables.map((variable) => variable.id));
    const result = placeMissingVariables(shape);
    const sizes = estimateNodeSizes(result.variables);
    expect(findLayoutIssues(result, sizes).filter((issue) => issue.severity === "error")).toEqual(
      [],
    );
    expect(placeMissingVariables(shape)).toEqual(result);
  });

  it("座標の無い変数につながる関連でも、書いてある曲がり具合を残す", () => {
    const shape = withoutPositions(["hiring"]);
    const curved: DiagramShape = {
      ...shape,
      links: shape.links.map((link) => (link.to === "hiring" ? { ...link, curvature: 0.3 } : link)),
    };
    const result = placeMissingVariables(curved);
    expect(result.links.find((link) => link.to === "hiring")!.curvature).toBe(0.3);
  });

  it("変数が数百あっても置ける", () => {
    const count = 400;
    const shape: DiagramShape = {
      version: 1,
      title: "",
      variables: Array.from({ length: count }, (_, at) => ({
        id: `v${at}` as VariableId,
        label: `v${at}`,
        ...(at === 0 ? {} : { position: { x: (at % 20) * 200, y: Math.floor(at / 20) * 120 } }),
      })),
      links: Array.from({ length: count - 1 }, (_, at) => ({
        id: `l${at}` as LinkId,
        from: `v${at}` as VariableId,
        to: `v${at + 1}` as VariableId,
        polarity: "+" as const,
      })),
      loops: [],
    };
    expect(placeMissingVariables(shape).variables).toHaveLength(count);
  });

  it("座標がそろっていれば、そのまま返す", () => {
    const diagram = createSampleDiagram();
    expect(placeMissingVariables(diagram)).toEqual(diagram);
  });

  it("並べ直しても動かなかった変数どうしの矢印は、突き抜けない限り曲がり具合を保ち、重ならない記号は動かさない", () => {
    const once = autoLayout(stacked(), sizesOf(stacked()));
    const curved: Diagram = {
      ...once,
      links: once.links.map((link) => ({ ...link, curvature: 0.25 })),
      loops: once.loops.map((loop) => ({
        ...loop,
        marker: { x: loop.marker!.x + 3, y: loop.marker!.y + 3 },
      })),
    };
    const sizes = sizesOf(curved);
    const through = new Set(
      findLayoutIssues(curved, sizes).flatMap((issue) =>
        issue.kind === "link-through" ? (issue.links ?? []) : [],
      ),
    );
    const result = autoLayout(curved, sizes);
    expect(result.variables).toEqual(curved.variables);
    for (const link of result.links) {
      if (through.has(link.id)) expect(link.curvature).not.toBe(0.25);
      else expect(link.curvature).toBe(0.25);
    }
    // 曲げ直した矢印を含むループは、矢印の形が変わるので記号も置き直す
    const untouched = (loops: Diagram["loops"]) =>
      loops
        .filter((loop) => !loop.links.some((link) => through.has(link)))
        .map((loop) => loop.marker);
    expect(untouched(curved.loops).length).toBeGreaterThan(0);
    expect(untouched(result.loops)).toEqual(untouched(curved.loops));
  });
});
