import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { resolveWebDir } from "./web-dir.ts";

describe("resolveWebDir", () => {
  it("公開したパッケージでは dist/web を使う", async () => {
    const root = await mkdtemp(join(tmpdir(), "loopcraft-pkg-"));
    await mkdir(join(root, "dist", "web"), { recursive: true });
    await writeFile(join(root, "dist", "web", "index.html"), "");
    expect(resolveWebDir(pathToFileURL(join(root, "dist", "cli.mjs")).href)).toBe(
      join(root, "dist", "web"),
    );
  });

  it("リポジトリでは apps/web/dist を使い、無ければ undefined", async () => {
    const root = await mkdtemp(join(tmpdir(), "loopcraft-repo-"));
    const module = pathToFileURL(join(root, "apps", "cli", "src", "web-dir.ts")).href;
    expect(resolveWebDir(module)).toBeUndefined();
    await mkdir(join(root, "apps", "web", "dist"), { recursive: true });
    await writeFile(join(root, "apps", "web", "dist", "index.html"), "");
    expect(resolveWebDir(module)).toBe(join(root, "apps", "web", "dist"));
  });
});
