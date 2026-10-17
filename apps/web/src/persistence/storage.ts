import { parseDiagramJson, stringifyDiagram } from "@loopcraft/core/io";
import type { Diagram } from "@loopcraft/core/schema";
import type { Opened } from "./store.ts";

const STORAGE_KEY = "loopcraft:document";

export const loadStoredDiagram = (): Opened => {
  let text: string | null;
  try {
    text = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    // ブラウザの設定などで、localStorage に触れること自体が例外になる
    return { status: "unreadable", problems: [String(error)] };
  }
  if (text === null) return { status: "missing" };
  const result = parseDiagramJson(text);
  if (result.ok) return { status: "ok", diagram: result.diagram };
  return {
    status: "unreadable",
    problems: result.errors.map((error) =>
      error.path ? `${error.path}: ${error.message}` : error.message,
    ),
    raw: text,
  };
};

export type StoreResult = { ok: true } | { ok: false; error: unknown };

export const storeDiagram = (diagram: Diagram): StoreResult => {
  try {
    localStorage.setItem(STORAGE_KEY, stringifyDiagram(diagram));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
};

export const watchOtherTabs = (listener: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
};
