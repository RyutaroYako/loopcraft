import * as v from "valibot";
import { findIntegrityIssues } from "./integrity.ts";
import { placeMissingVariables } from "./layout.ts";
import type { IntegrityPath } from "./integrity.ts";

/** 破壊的変更のたびに上げ、読み込み時にマイグレーションする */
export const DIAGRAM_FORMAT_VERSION = 1;

const IdSchema = v.pipe(v.string(), v.nonEmpty("ID は空にできません"));

export const VariableIdSchema = v.pipe(IdSchema, v.brand("VariableId"));
export const LinkIdSchema = v.pipe(IdSchema, v.brand("LinkId"));
export const LoopIdSchema = v.pipe(IdSchema, v.brand("LoopId"));

/*
 * 知らないキーを捨てずにエラーにするのは、polarity を polarty と打ち違えても通ってしまい、
 * 書いたつもりの値が黙って消えるため
 */

export const PointSchema = v.pipe(
  v.strictObject({
    x: v.number(),
    y: v.number(),
  }),
  v.title("Point"),
  v.description("キャンバス上の座標"),
);

export const VariableSchema = v.pipe(
  v.strictObject({
    id: VariableIdSchema,
    label: v.pipe(v.string(), v.description("表示名（例: 社員数）")),
    description: v.optional(v.string()),
    position: v.optional(
      v.pipe(PointSchema, v.description("中心の座標。省くと、読み込むときに自動で配置する")),
    ),
  }),
  v.title("Variable"),
  v.description("変数（売上や社員数のように増えたり減ったりする、システムを構成する要素）"),
);

export const PolaritySchema = v.pipe(
  v.picklist(["+", "-"]),
  v.title("Polarity"),
  v.description("+: 原因が増えると結果も増える / -: 原因が増えると結果は減る"),
);

export const LinkSchema = v.pipe(
  v.strictObject({
    id: LinkIdSchema,
    from: v.pipe(VariableIdSchema, v.description("原因側の変数の ID")),
    to: v.pipe(VariableIdSchema, v.description("結果側の変数の ID")),
    polarity: PolaritySchema,
    delay: v.optional(v.pipe(v.boolean(), v.description("影響が現れるまでに遅れがあるか"))),
    curvature: v.optional(
      v.pipe(
        v.number(),
        v.description("曲がり具合。端点間の距離に対する膨らみの比率で、正なら進行方向の左に膨らむ"),
      ),
    ),
    description: v.optional(v.string()),
  }),
  v.title("Link"),
  v.description("変数同士の因果関係（有向辺）"),
);

export const LoopSchema = v.pipe(
  v.strictObject({
    id: LoopIdSchema,
    name: v.pipe(v.string(), v.description("ループの名前（例: 成長の好循環）")),
    links: v.pipe(
      v.array(LinkIdSchema),
      v.minLength(2, "ループには関連が 2 本以上必要です"),
      v.description(
        "ループを構成する関連の ID を辿る順に並べたもの。最後の関連の to が最初の関連の from に戻る",
      ),
    ),
    description: v.optional(v.string()),
    marker: v.optional(PointSchema),
  }),
  v.title("Loop"),
  v.description(
    "注目するループ。自己強化/バランスの別は構成する関連の極性から導出するため保持しない",
  ),
);

/** 参照整合性をここに含めないのは、JSON Schema の生成元として形だけを残すため */
export const DiagramShapeSchema = v.pipe(
  v.strictObject({
    $schema: v.optional(v.string()),
    version: v.literal(DIAGRAM_FORMAT_VERSION),
    title: v.string(),
    description: v.optional(v.string()),
    variables: v.array(VariableSchema),
    links: v.array(LinkSchema),
    loops: v.array(LoopSchema),
  }),
  v.title("SystemDiagram"),
  v.description("システム思考のシステム図（因果ループ図）"),
);

export const DiagramSchema = v.pipe(
  DiagramShapeSchema,
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) return;
    for (const issue of findIntegrityIssues(dataset.value)) {
      addIssue({
        message: issue.message,
        path: toIssuePath(dataset.value, issue.path),
      });
    }
  }),
  v.transform(placeMissingVariables),
);

export type Point = v.InferOutput<typeof PointSchema>;
export type VariableId = v.InferOutput<typeof VariableIdSchema>;
export type LinkId = v.InferOutput<typeof LinkIdSchema>;
export type LoopId = v.InferOutput<typeof LoopIdSchema>;
export type VariableShape = v.InferOutput<typeof VariableSchema>;
export type Variable = Omit<VariableShape, "position"> & { position: Point };
export type Polarity = v.InferOutput<typeof PolaritySchema>;
export type Link = v.InferOutput<typeof LinkSchema>;
export type Loop = v.InferOutput<typeof LoopSchema>;
export type DiagramShape = v.InferOutput<typeof DiagramShapeSchema>;
/** 読み込んだ後の図。座標の無い変数は、読み込むときに配置してある */
export type Diagram = Omit<DiagramShape, "variables"> & { variables: Variable[] };

const toIssuePath = (
  root: unknown,
  path: IntegrityPath,
): [v.IssuePathItem, ...v.IssuePathItem[]] => {
  let input = root;
  const items = path.map((key): v.IssuePathItem => {
    if (typeof key === "number") {
      const array = input as unknown[];
      input = array[key];
      return { type: "array", origin: "value", input: array, key, value: input };
    }
    const object = input as Record<string, unknown>;
    input = object[key];
    return { type: "object", origin: "value", input: object, key, value: input };
  });
  const [first, ...rest] = items;
  if (!first) throw new Error("Integrity issue path must not be empty");
  return [first, ...rest];
};
