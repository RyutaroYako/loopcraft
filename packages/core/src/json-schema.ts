import { toJsonSchema } from "@valibot/to-json-schema";
import {
  DiagramShapeSchema,
  LinkSchema,
  LoopSchema,
  PointSchema,
  VariableSchema,
} from "./schema.ts";

/** ID の一意性や参照先の存在など、JSON Schema で表せない制約は含まない */
export const createDiagramJsonSchema = () => {
  return toJsonSchema(DiagramShapeSchema, {
    target: "draft-2020-12",
    definitions: {
      Point: PointSchema,
      Variable: VariableSchema,
      Link: LinkSchema,
      Loop: LoopSchema,
    },
    // brand を出さないのは、型レベルの区別にだけ使い、JSON 上はただの文字列のため。
    // finite を出さないのは、JSON の数値はもともと有限で、桁あふれだけが読み込みで無限大になるため
    ignoreActions: ["brand", "finite"],
  });
};
