import { parseDiagramJson, stringifyDiagram } from "../model/io.ts";
import type { Diagram } from "../model/schema.ts";

const STORAGE_KEY = "system-diagram-editor:document";

export type StoredDiagram =
  | { status: "empty" }
  | { status: "ok"; diagram: Diagram }
  /** 保存されていたが読み込めなかった。元の文字列は backupKey に退避してある */
  | { status: "invalid"; raw: string; errors: string[]; backupKey: string | undefined }
  /** ブラウザの設定などで localStorage 自体が使えない */
  | { status: "unavailable"; error: unknown };

export function loadStoredDiagram(): StoredDiagram {
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
    // 次の自動保存で上書きされる前に、読み込めなかった内容を別のキーへ残す
    backupKey: backup(text),
  };
}

function backup(text: string) {
  const key = `${STORAGE_KEY}:backup:${Date.now()}`;
  try {
    localStorage.setItem(key, text);
    return key;
  } catch {
    return undefined;
  }
}

export type StoreResult = { ok: true } | { ok: false; error: unknown };

export function storeDiagram(diagram: Diagram): StoreResult {
  try {
    localStorage.setItem(STORAGE_KEY, stringifyDiagram(diagram));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/** 別のタブが同じ図を保存したときに呼ばれる。戻り値で購読を解除する */
export function watchOtherTabs(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
