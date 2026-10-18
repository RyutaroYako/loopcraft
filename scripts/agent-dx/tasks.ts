import {
  findLink,
  findVariable,
  hasCycle,
  isWellFormed,
  layoutProblems,
  readDiagram,
  structureOf,
} from "./score.ts";
import type { DiagramFile, Score } from "./score.ts";

export interface Task {
  name: string;
  /** fixtures/ のファイルを diagram.json として置く */
  fixture?: string;
  prompt: string;
  score(after: string | undefined, before: string | undefined): Score;
}

const INTRO =
  "このディレクトリには因果ループ図の CLI、loopcraft が入っています（npx loopcraft で動きます）。";

export const TASKS: Task[] = [
  {
    name: "create",
    prompt: [
      INTRO,
      "次の話を因果ループ図にして、diagram.json に保存してください。ブラウザで開いたときに、変数どうしが重ならず読みやすい配置にしてください。",
      "",
      "飲食店が広告を出すと客数が増え、客数が増えると売上が増え、売上が増えると広告費をかけられる。",
      "一方で、客数が増えると待ち時間が長くなり、待ち時間が長くなると満足度が下がり、満足度が下がると客数が減る。",
      "また、売上が増えると時間をおいて店員を増やせ、店員が増えると待ち時間は短くなる。",
    ].join("\n"),
    score(after) {
      const diagram = readDiagram(after);
      if (!diagram) return { passed: false, checks: { readable: false } };
      const ad = findVariable(diagram, "広告");
      const customers = findVariable(diagram, "客数");
      const sales = findVariable(diagram, "売上");
      const waiting = findVariable(diagram, "待ち時間");
      const satisfaction = findVariable(diagram, "満足度");
      const staff = findVariable(diagram, "店員");
      const checks = {
        readable: true,
        wellFormed: isWellFormed(diagram),
        reinforcing: hasCycle(diagram, "R", [ad, customers, sales]),
        balancing: hasCycle(diagram, "B", [customers, waiting, satisfaction]),
        staffing:
          findLink(diagram, sales, staff)?.delay === true &&
          findLink(diagram, staff, waiting)?.polarity === "-",
        layout: layoutProblems(diagram).length === 0,
      };
      return { passed: Object.values(checks).every(Boolean), checks };
    },
  },
  {
    name: "extend",
    fixture: "sample.json",
    prompt: [
      INTRO,
      "diagram.json の図に「顧客満足度」という変数を足してください。一人あたりの業務量が増えると顧客満足度は下がり、顧客満足度が上がると売上が増えます。",
      "このつながりでできるループを、「サービス品質」という名前で注目するループに加えてください。ほかの変数や関連は変えないでください。",
    ].join("\n"),
    score(after, before) {
      const diagram = readDiagram(after);
      const original = readDiagram(before)!;
      if (!diagram) return { passed: false, checks: { readable: false } };
      const workload = findVariable(diagram, "業務量");
      const satisfaction = findVariable(diagram, "顧客満足度");
      const sales = findVariable(diagram, "売上");
      const toSatisfaction = findLink(diagram, workload, satisfaction);
      const toSales = findLink(diagram, satisfaction, sales);
      const loop = diagram.loops.find((item) => item.name.includes("サービス品質"));
      const checks = {
        readable: true,
        wellFormed: isWellFormed(diagram),
        links: toSatisfaction?.polarity === "-" && toSales?.polarity === "+",
        featured:
          loop !== undefined &&
          toSatisfaction !== undefined &&
          toSales !== undefined &&
          loop.links.includes(toSatisfaction.id) &&
          loop.links.includes(toSales.id),
        kept: keepsOriginal(diagram, original),
        layout: layoutProblems(diagram).length === 0,
      };
      return { passed: Object.values(checks).every(Boolean), checks };
    },
  },
  {
    name: "tidy",
    fixture: "cluttered.json",
    prompt: [
      INTRO,
      "diagram.json の図は変数が重なっていて読めません。変数どうしが重ならず、矢印が変数を突き抜けないように配置を直してください。変数・関連・ループの中身は変えないでください。",
    ].join("\n"),
    score(after, before) {
      const diagram = readDiagram(after);
      const original = readDiagram(before)!;
      if (!diagram) return { passed: false, checks: { readable: false } };
      const checks = {
        readable: true,
        wellFormed: isWellFormed(diagram),
        kept: structureOf(diagram) === structureOf(original),
        layout: layoutProblems(diagram).length === 0,
      };
      return { passed: Object.values(checks).every(Boolean), checks };
    },
  },
];

function keepsOriginal(diagram: DiagramFile, original: DiagramFile) {
  const labels = new Map(diagram.variables.map((variable) => [variable.id, variable.label]));
  const links = new Map(diagram.links.map((link) => [link.id, link]));
  return (
    original.variables.every((variable) => labels.get(variable.id) === variable.label) &&
    original.links.every((link) => {
      const kept = links.get(link.id);
      return kept?.from === link.from && kept.to === link.to && kept.polarity === link.polarity;
    })
  );
}
