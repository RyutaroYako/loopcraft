import { writeFile } from "node:fs/promises";
import { createDiagramJsonSchema } from "../src/model/json-schema.ts";

const outFile = new URL("../public/system-diagram.schema.json", import.meta.url);

await writeFile(outFile, `${JSON.stringify(createDiagramJsonSchema(), null, 2)}\n`);
console.log(`Wrote ${outFile.pathname}`);
