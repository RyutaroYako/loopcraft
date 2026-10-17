import * as v from "valibot";
import { DiagramSchema } from "../schema.ts";
import type { Diagram } from "../schema.ts";

export const createSampleInput = () => {
  return {
    version: 1,
    title: "採用と育成",
    variables: [
      { id: "staff", label: "社員数", position: { x: 0, y: 0 } },
      { id: "training", label: "教育コスト", position: { x: 200, y: 0 } },
      { id: "profit", label: "利益", position: { x: 200, y: 200 } },
      { id: "sales", label: "売上", position: { x: -200, y: 200 } },
      { id: "hiring", label: "採用数", position: { x: 0, y: 400 } },
    ],
    links: [
      { id: "l1", from: "staff", to: "training", polarity: "+" },
      { id: "l2", from: "training", to: "profit", polarity: "-" },
      { id: "l3", from: "profit", to: "hiring", polarity: "+", delay: true },
      { id: "l4", from: "hiring", to: "staff", polarity: "+" },
      { id: "l5", from: "staff", to: "sales", polarity: "+" },
      { id: "l6", from: "sales", to: "profit", polarity: "+" },
    ],
    loops: [
      { id: "b1", name: "教育コストの重荷", links: ["l1", "l2", "l3", "l4"] },
      { id: "r1", name: "成長の好循環", links: ["l5", "l6", "l3", "l4"] },
    ],
  };
};

export const createSample = (): Diagram => v.parse(DiagramSchema, createSampleInput());
