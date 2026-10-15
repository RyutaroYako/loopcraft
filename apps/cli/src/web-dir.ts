import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** 公開したパッケージでは dist/web、リポジトリでソースから動かすときは apps/web/dist */
export function resolveWebDir(base: string = import.meta.url): string | undefined {
  const candidates = [new URL("./web/", base), new URL("../../web/dist/", base)];
  for (const candidate of candidates) {
    const path = fileURLToPath(candidate);
    if (existsSync(`${path}index.html`)) return path.replace(/[\\/]$/, "");
  }
  return undefined;
}
