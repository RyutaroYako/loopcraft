import { createDiagramJsonSchema } from "@loopcraft/core/json-schema";
import type { Context } from "../context.ts";

/** 図の JSON Schema を stdout に出す。エディタの補完や他のツールでの検証に使う */
export function schema({ log }: Context) {
  log.output(JSON.stringify(createDiagramJsonSchema(), null, 2));
}
