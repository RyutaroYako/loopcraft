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

const BACKUP_PREFIX = `${STORAGE_KEY}:backup:`;

function backup(text: string) {
  const prefix = BACKUP_PREFIX;
  try {
    // 読み込めないまま何度開き直しても、同じ内容の退避が増え続けないようにする
    for (let index = 0; index < localStorage.length; index++) {
      const existing = localStorage.key(index);
      if (existing?.startsWith(prefix) && localStorage.getItem(existing) === text) return existing;
    }
    const key = `${prefix}${Date.now()}`;
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

export interface Backup {
  key: string;
  savedAt: Date;
}

/** 読み込めなかったときに退避したデータの一覧。新しい順 */
export function listBackups(): Backup[] {
  try {
    const backups: Backup[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith(BACKUP_PREFIX)) {
        backups.push({ key, savedAt: new Date(Number(key.slice(BACKUP_PREFIX.length))) });
      }
    }
    return backups.toSorted((a, b) => b.savedAt.getTime() - a.savedAt.getTime());
  } catch {
    return [];
  }
}

export function readBackup(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

export function removeBackup(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // 消せなくても一覧に残るだけで、編集には影響しない
  }
}
