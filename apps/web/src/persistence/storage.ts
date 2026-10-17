import { parseDiagramJson, stringifyDiagram } from "@loopcraft/core/io";
import type { Diagram } from "@loopcraft/core/schema";

const STORAGE_KEY = "loopcraft:document";

export type StoredDiagram =
  | { status: "empty" }
  | { status: "ok"; diagram: Diagram }
  /** 元の文字列は backupKey に退避してある */
  | { status: "invalid"; raw: string; errors: string[]; backupKey: string | undefined }
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
    // 退避しないと、読み込めなかった内容が次の自動保存で上書きされる
    backupKey: backup(text),
  };
};

const BACKUP_PREFIX = `${STORAGE_KEY}:backup:`;

const backup = (text: string) => {
  const prefix = BACKUP_PREFIX;
  try {
    // 探さずに退避すると、読み込めないまま開き直すたびに同じ内容の退避が増え続ける
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

export interface Backup {
  key: string;
  savedAt: Date;
}

export const listBackups = (): Backup[] => {
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
};

export const readBackup = (key: string): string | undefined => {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
};

export const removeBackup = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // 消せなくても一覧に残るだけで、編集には影響しない
  }
};
