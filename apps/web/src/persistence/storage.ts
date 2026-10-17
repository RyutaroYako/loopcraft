import { parseDiagramJson, stringifyDiagram } from "@loopcraft/core/io";
import type { Diagram } from "@loopcraft/core/schema";

const STORAGE_KEY = "loopcraft:document";

export type StoredDiagram =
  | { status: "empty" }
  | { status: "ok"; diagram: Diagram }
  | { status: "invalid"; raw: string; errors: string[] }
  /** ブラウザの設定などで、localStorage に触れること自体が例外になる */
  | { status: "unavailable"; error: unknown };

export const loadStoredDiagram = (): StoredDiagram => {
  let text: string | null;
  try {
    text = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    return { status: "unavailable", error };
  }
  if (text === null) return { status: "empty" };
  const result = parseDiagramJson(text);
  if (result.ok) return { status: "ok", diagram: result.diagram };
  return {
    status: "invalid",
    raw: text,
    errors: result.errors.map((error) =>
      error.path ? `${error.path}: ${error.message}` : error.message,
    ),
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
