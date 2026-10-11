import { toJsonSchema } from "@valibot/to-json-schema";
import {
  DiagramShapeSchema,
  LinkSchema,
  LoopSchema,
  PointSchema,
  VariableSchema,
} from "./schema.ts";

/**
 * 保存形式の JSON Schema を生成する。
 * ID の一意性や参照先の存在など、JSON Schema で表せない制約は含まれない。
 */
export function createDiagramJsonSchema() {
  return toJsonSchema(DiagramShapeSchema, {
    target: "draft-2020-12",
    definitions: {
      Point: PointSchema,
      Variable: VariableSchema,
      Link: LinkSchema,
      Loop: LoopSchema,
    },
    // brand は型レベルの区別にだけ使っており、JSON 上はただの文字列
    ignoreActions: ["brand"],
  });
}
