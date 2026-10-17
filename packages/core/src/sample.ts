import * as v from "valibot";
import { DiagramSchema } from "./schema.ts";
import type { Diagram } from "./schema.ts";

export const createSampleDiagram = (): Diagram => {
  return v.parse(DiagramSchema, {
    version: 1,
    title: "組織の成長と人の負荷",
    description: "人を増やすと売上が伸びる一方で、育成と業務負荷が成長を押し戻す。",
    variables: [
      { id: "staff", label: "社員数", position: { x: 0, y: 0 } },
      { id: "sales", label: "売上", position: { x: 290, y: 130 } },
      { id: "profit", label: "利益", position: { x: 580, y: 0 } },
      { id: "hiring", label: "採用数", position: { x: 290, y: -110 } },
      { id: "training", label: "教育コスト", position: { x: 290, y: -300 } },
      { id: "workload", label: "一人あたりの業務量", position: { x: -290, y: 190 } },
      { id: "attrition", label: "離職数", position: { x: -290, y: -190 } },
    ],
    links: [
      { id: "l_sales", from: "staff", to: "sales", polarity: "+" },
      { id: "l_profit", from: "sales", to: "profit", polarity: "+" },
      { id: "l_hire", from: "profit", to: "hiring", polarity: "+", delay: true },
      { id: "l_join", from: "hiring", to: "staff", polarity: "+" },
      { id: "l_train", from: "staff", to: "training", polarity: "+" },
      { id: "l_cost", from: "training", to: "profit", polarity: "-" },
      { id: "l_share", from: "staff", to: "workload", polarity: "-" },
      { id: "l_burnout", from: "workload", to: "attrition", polarity: "+", delay: true },
      { id: "l_leave", from: "attrition", to: "staff", polarity: "-" },
      { id: "l_demand", from: "sales", to: "workload", polarity: "+" },
    ],
    loops: [
      {
        id: "p_growth",
        name: "成長エンジン",
        links: ["l_sales", "l_profit", "l_hire", "l_join"],
        marker: { x: 290, y: -15 },
      },
      {
        id: "p_training",
        name: "育成の負担",
        links: ["l_train", "l_cost", "l_hire", "l_join"],
        marker: { x: 290, y: -205 },
      },
      {
        id: "p_burnout",
        name: "負荷と離職の悪循環",
        links: ["l_share", "l_burnout", "l_leave"],
      },
    ],
  });
};
