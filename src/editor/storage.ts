import { parseDiagramJson, stringifyDiagram } from "../model/io.ts";
import type { Diagram } from "../model/schema.ts";

const STORAGE_KEY = "system-diagram-editor:document";

/** 前回の編集内容。無い・壊れているときは undefined */
export function loadStoredDiagram(): Diagram | undefined {
  const text = localStorage.getItem(STORAGE_KEY);
  if (text === null) return undefined;
  const result = parseDiagramJson(text);
  if (result.ok) return result.diagram;
  console.warn("保存されていた図を読み込めませんでした", result.errors);
  return undefined;
}

export function storeDiagram(diagram: Diagram) {
  try {
    localStorage.setItem(STORAGE_KEY, stringifyDiagram(diagram));
  } catch (error) {
    // 容量超過やプライベートモードでは保存できないが、編集は続けられる
    console.warn("図を保存できませんでした", error);
  }
}
