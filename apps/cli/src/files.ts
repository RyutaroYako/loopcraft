import { createHash, randomBytes } from "node:crypto";
import {
  access,
  chmod,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseDiagramJson, stringifyDiagram } from "@loopcraft/core/io";
import type { DiagramError } from "@loopcraft/core/io";
import type { Diagram, VariableId } from "@loopcraft/core/schema";
import type { Revision } from "@loopcraft/core/session";

export type DiagramFile =
  | { status: "ok"; diagram: Diagram; revision: Revision; unplaced: VariableId[] }
  | { status: "missing" }
  | { status: "invalid"; revision: Revision; errors: DiagramError[] };

/** 更新時刻を使わないのは、同じ内容を同じ版として扱うため */
export function revisionOf(text: string): Revision {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export async function readDiagramFile(path: string): Promise<DiagramFile> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) return { status: "missing" };
    throw error;
  }
  const revision = revisionOf(text);
  const result = parseDiagramJson(text);
  if (result.ok) {
    return { status: "ok", diagram: result.diagram, revision, unplaced: result.unplaced };
  }
  return { status: "invalid", revision, errors: result.errors };
}

/**
 * 直接書き込まないのは、途中で止まるとファイルが壊れるため。
 * 素直に rename で置き換えると、シンボリックリンクと元の権限が失われる
 */
export async function writeDiagramFile(path: string, diagram: Diagram): Promise<Revision> {
  const text = stringifyDiagram(diagram);
  let target = path;
  let mode: number | undefined;
  try {
    target = await realpath(path);
    mode = (await stat(target)).mode & 0o7777;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  const temporary = join(
    dirname(target),
    `.${basename(target)}.${randomBytes(4).toString("hex")}.tmp`,
  );
  try {
    await writeFile(temporary, text, "utf8");
    if (mode !== undefined) await chmod(temporary, mode);
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return revisionOf(text);
}

export async function listJsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !isIgnored(entry.name))
    .map((entry) => entry.name)
    .toSorted((a, b) => a.localeCompare(b));
}

function isIgnored(name: string) {
  return (
    name.startsWith(".") || ["package.json", "package-lock.json", "tsconfig.json"].includes(name)
  );
}

export function isNotFound(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** 権限などで調べられないときは false にせず投げる */
export async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

/** 権限などで調べられないときは false にせず投げる */
export async function isDirectory(path: string) {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

/** ほかの理由で読めないときに null にしないのは、上書きしてしまうため */
export async function currentRevision(file: string): Promise<Revision | null> {
  try {
    return revisionOf(await readFile(file, "utf8"));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}
