import { readFileSync } from "node:fs";

/** パッケージのバージョン。ソースから動かしても、ビルド後の dist から動かしても 1 つ上に package.json がある */
export function readVersion(base: URL = new URL("../package.json", import.meta.url)): string {
  const pkg: unknown = JSON.parse(readFileSync(base, "utf8"));
  if (
    typeof pkg === "object" &&
    pkg !== null &&
    "version" in pkg &&
    typeof pkg.version === "string"
  ) {
    return pkg.version;
  }
  throw new Error("package.json に version がありません");
}
