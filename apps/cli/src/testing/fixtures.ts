import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringifyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { createMemoryLogger } from "../log.ts";

export async function createWorkspace() {
  const cwd = await mkdtemp(join(tmpdir(), "loopcraft-"));
  const memory = createMemoryLogger();
  return { cwd, ...memory, context: { cwd, log: memory.logger } };
}

export async function writeSample(cwd: string, name = "diagram.json") {
  const path = join(cwd, name);
  await writeFile(path, stringifyDiagram(createSampleDiagram()));
  return path;
}

export async function createWebDir() {
  const dir = await mkdtemp(join(tmpdir(), "loopcraft-web-"));
  await writeFile(
    join(dir, "index.html"),
    "<!doctype html><html><head><title>t</title></head></html>",
  );
  await writeFile(join(dir, "app.css"), "body{}");
  await writeFile(join(dir, "favicon.ico"), "x");
  await writeFile(join(dir, "blob.bin"), "x");
  return dir;
}
