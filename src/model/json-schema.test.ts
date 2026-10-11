import { expect, it } from "vite-plus/test";
import committed from "../../public/system-diagram.schema.json";
import { createDiagramJsonSchema } from "./json-schema.ts";

it("public の JSON Schema が valibot のスキーマと一致している", () => {
  // 失敗したら `vp run gen:schema` で再生成する
  expect(committed).toEqual(createDiagramJsonSchema());
});
