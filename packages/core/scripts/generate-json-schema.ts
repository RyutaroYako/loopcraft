import { writeFile } from "node:fs/promises";
import { createDiagramJsonSchema } from "../src/json-schema.ts";

const outFile = new URL("../loopcraft.schema.json", import.meta.url);

await writeFile(outFile, `${JSON.stringify(createDiagramJsonSchema(), null, 2)}\n`);
console.log(`Wrote ${outFile.pathname}`);
