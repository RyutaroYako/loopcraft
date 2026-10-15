import { createDiagramJsonSchema } from "@loopcraft/core/json-schema";
import type { Context } from "../context.ts";

export function schema({ log }: Context) {
  log.output(JSON.stringify(createDiagramJsonSchema(), null, 2));
}
