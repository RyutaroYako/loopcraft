import { createHash, randomBytes } from "node:crypto";
import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseDiagramJson, stringifyDiagram } from "@loopcraft/core/io";
import type { Diagram } from "@loopcraft/core/schema";
import type { Revision } from "@loopcraft/core/session";

export type DiagramFile =
  | { status: "ok"; diagram: Diagram; revision: Revision }
  | { status: "missing" }
  | { status: "invalid"; revision: Revision; errors: string[] };

/** 中身から計算する版。同じ内容なら同じ値になる */
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
  if (result.ok) return { status: "ok", diagram: result.diagram, revision };
  return {
    status: "invalid",
    revision,
    errors: result.errors.map((error) =>
      error.path ? `${error.path}: ${error.message}` : error.message,
    ),
  };
}

/** 書き込み中に止まってもファイルが壊れないよう、一時ファイルに書いてから置き換える */
export async function writeDiagramFile(path: string, diagram: Diagram): Promise<Revision> {
  const text = stringifyDiagram(diagram);
  const temporary = join(dirname(path), `.${basename(path)}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    await writeFile(temporary, text, "utf8");
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return revisionOf(text);
}

/** ディレクトリ直下の JSON ファイル。対話的にファイルを選ぶときの候補 */
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
