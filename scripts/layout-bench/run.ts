/**
 * 自動配置を決まった図の一式にかけ、崩れの数・大きさ・時間を比べる。
 *
 *   node scripts/layout-bench/run.ts
 *   node scripts/layout-bench/run.ts --out tmp/layout   # 並べた図を JSON で書き出す（render で画像にできる）
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { boundsOf, estimateNodeSizes } from "../../packages/core/src/geometry.ts";
import { autoLayout } from "../../packages/core/src/layout.ts";
import { findLayoutIssues } from "../../packages/core/src/layout-check.ts";
import { createSampleDiagram } from "../../packages/core/src/sample.ts";
import type { Diagram, LinkId, LoopId, VariableId } from "../../packages/core/src/schema.ts";

const { values } = parseArgs({ options: { out: { type: "string" } } });

const LABELS = [
  "売上",
  "利益",
  "社員数",
  "採用数",
  "教育コスト",
  "一人あたりの業務量",
  "離職数",
  "顧客満足度",
  "口コミ",
  "新規顧客数",
  "解約率",
  "広告費",
  "ブランド認知",
  "製品の品質",
  "不具合の数",
  "開発速度",
  "技術的負債",
  "リファクタリングの時間",
  "残業時間",
  "士気",
  "価格",
  "競合の数",
  "市場の大きさ",
  "在庫",
  "納期の遅れ",
  "問い合わせ件数",
  "サポートの負荷",
  "研修の時間",
  "経験者の割合",
  "提案の質",
  "受注率",
  "値引き",
  "単価",
  "投資額",
  "研究開発費",
  "特許の数",
];

const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

/** 前のループと 1〜2 個の変数を分け合うループを足していき、余った変数は鎖でつなぐ */
const generate = (seed: number, count: number, loopCount: number): Diagram => {
  const next = random(seed);
  const ids = Array.from({ length: count }, (_, at) => `v${at}` as VariableId);
  const links: Diagram["links"] = [];
  const loops: Diagram["loops"] = [];
  const linkByPair = new Map<string, LinkId>();
  const link = (from: VariableId, to: VariableId) => {
    const key = `${from}>${to}`;
    let id = linkByPair.get(key);
    if (!id) {
      id = `l${links.length}` as LinkId;
      linkByPair.set(key, id);
      links.push({ id, from, to, polarity: next() < 0.7 ? "+" : "-" });
    }
    return id;
  };
  let used = 0;
  for (let at = 0; at < loopCount; at++) {
    const length = 3 + Math.floor(next() * 4);
    const members: VariableId[] = [];
    if (at > 0) {
      const shared = 1 + Math.floor(next() * 2);
      for (let step = 0; step < shared; step++) {
        const pick = ids[Math.floor(next() * used)]!;
        if (!members.includes(pick)) members.push(pick);
      }
    }
    while (members.length < length) {
      const id = used < count ? ids[used++]! : ids[Math.floor(next() * count)]!;
      if (!members.includes(id)) members.push(id);
    }
    loops.push({
      id: `p${at}` as LoopId,
      name: `ループ${at}`,
      links: members.map((member, step) => link(member, members[(step + 1) % members.length]!)),
    });
  }
  for (; used < count; used++) link(ids[Math.floor(next() * used)]!, ids[used]!);
  return {
    version: 1,
    title: `${count} 個の変数`,
    variables: ids.map((id, at) => ({
      id,
      label: LABELS[at % LABELS.length]!,
      position: { x: 0, y: 0 },
    })),
    links,
    loops,
  };
};

const corpus: [string, Diagram][] = [
  ["sample", createSampleDiagram()],
  [
    "cluttered",
    JSON.parse(
      readFileSync(new URL("../agent-dx/fixtures/cluttered.json", import.meta.url), "utf8"),
    ),
  ],
];
for (const [count, loopCount] of [
  [10, 3],
  [15, 4],
  [20, 6],
  [25, 7],
  [30, 9],
  [40, 12],
] as const) {
  for (const seed of [1, 2, 3]) {
    corpus.push([`${count}-${seed}`, generate(seed * 97 + count, count, loopCount)]);
  }
}

/** 1 個足して並べ直したときに、もとの変数が平均でどれだけ動くか */
const drift = (laid: Diagram) => {
  const first = laid.variables[0]!;
  const extra = "extra" as VariableId;
  const grown: Diagram = {
    ...laid,
    variables: [...laid.variables, { id: extra, label: "追加した変数", position: first.position }],
    links: [...laid.links, { id: "extra" as LinkId, from: first.id, to: extra, polarity: "+" }],
  };
  const again = autoLayout(grown, estimateNodeSizes(grown.variables));
  const before = new Map(laid.variables.map((variable) => [variable.id, variable.position]));
  let total = 0;
  for (const variable of again.variables) {
    const old = before.get(variable.id);
    if (old) total += Math.hypot(variable.position.x - old.x, variable.position.y - old.y);
  }
  return total / laid.variables.length;
};

const KINDS = ["overlap", "link-through", "crossing", "label-overlap", "marker-overlap"] as const;
const rows = corpus.map(([name, diagram]) => {
  const sizes = estimateNodeSizes(diagram.variables);
  const started = performance.now();
  const laid = autoLayout(diagram, sizes);
  const ms = performance.now() - started;
  if (values.out) {
    mkdirSync(values.out, { recursive: true });
    writeFileSync(join(values.out, `${name}.json`), `${JSON.stringify(laid, null, 2)}\n`);
  }
  const issues = findLayoutIssues(laid, sizes);
  const bounds = boundsOf(
    laid.variables.map((v) => ({ center: v.position, size: sizes.get(v.id)! })),
  )!;
  return {
    name,
    variables: diagram.variables.length,
    ...Object.fromEntries(
      KINDS.map((kind) => [kind, issues.filter((issue) => issue.kind === kind).length]),
    ),
    width: Math.round(bounds.maxX - bounds.minX),
    height: Math.round(bounds.maxY - bounds.minY),
    ms: Math.round(ms),
    drift: Math.round(drift(laid)),
  } as Record<string, number | string>;
});
const sum = (key: string) => rows.reduce((total, row) => total + (row[key] as number), 0);
rows.push({
  name: "合計",
  variables: sum("variables"),
  ...Object.fromEntries(KINDS.map((kind) => [kind, sum(kind)])),
  width: sum("width"),
  height: sum("height"),
  ms: sum("ms"),
  drift: sum("drift"),
});
console.table(rows);
