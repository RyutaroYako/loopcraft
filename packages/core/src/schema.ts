import * as v from "valibot";
import { findIntegrityIssues, type IntegrityPath } from "./integrity.ts";

/** 現在のファイル形式のバージョン。破壊的変更のたびに上げ、読み込み時にマイグレーションする。 */
export const DIAGRAM_FORMAT_VERSION = 1;

const IdSchema = v.pipe(v.string(), v.nonEmpty("ID は空にできません"));

export const VariableIdSchema = v.pipe(IdSchema, v.brand("VariableId"));
export const LinkIdSchema = v.pipe(IdSchema, v.brand("LinkId"));
export const LoopIdSchema = v.pipe(IdSchema, v.brand("LoopId"));

export const PointSchema = v.pipe(
  v.object({
    x: v.number(),
    y: v.number(),
  }),
  v.title("Point"),
  v.description("キャンバス上の座標"),
);

export const VariableSchema = v.pipe(
  v.object({
    id: VariableIdSchema,
    label: v.pipe(v.string(), v.description("表示名（例: 社員数）")),
    description: v.optional(v.string()),
    position: PointSchema,
  }),
  v.title("Variable"),
  v.description("出来事（システムを構成する変数）"),
);

export const PolaritySchema = v.pipe(
  v.picklist(["+", "-"]),
  v.title("Polarity"),
  v.description(
    "+: 原因が増えると結果も増える（正の相関）/ -: 原因が増えると結果は減る（負の相関）",
  ),
);

export const LinkSchema = v.pipe(
  v.object({
    id: LinkIdSchema,
    from: v.pipe(VariableIdSchema, v.description("原因側の出来事の ID")),
    to: v.pipe(VariableIdSchema, v.description("結果側の出来事の ID")),
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
  v.description("出来事同士の因果関係（有向辺）"),
);

export const LoopSchema = v.pipe(
  v.object({
    id: LoopIdSchema,
    name: v.pipe(v.string(), v.description("ループの名前（例: 成長の好循環）")),
    links: v.pipe(
      v.array(LinkIdSchema),
      v.minLength(2, "ループは 2 本以上の関連で構成されます"),
      v.description(
        "ループを構成する関連の ID を辿る順に並べたもの。最後の関連の to が最初の関連の from に戻る",
      ),
    ),
    description: v.optional(v.string()),
    /** ループ記号（R/B）の表示位置 */
    marker: v.optional(PointSchema),
  }),
  v.title("Loop"),
  v.description(
    "システム図の主張として見出したループ。自己強化/バランスの別は構成する関連の極性から導出するため保持しない",
  ),
);

/** 参照整合性を含まない、JSON の形だけを表すスキーマ。JSON Schema の生成元。 */
export const DiagramShapeSchema = v.pipe(
  v.object({
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

/** 形に加えて ID の一意性・参照先の存在・ループの閉路性まで検証するスキーマ。 */
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
);

export type Point = v.InferOutput<typeof PointSchema>;
export type VariableId = v.InferOutput<typeof VariableIdSchema>;
export type LinkId = v.InferOutput<typeof LinkIdSchema>;
export type LoopId = v.InferOutput<typeof LoopIdSchema>;
export type Variable = v.InferOutput<typeof VariableSchema>;
export type Polarity = v.InferOutput<typeof PolaritySchema>;
export type Link = v.InferOutput<typeof LinkSchema>;
export type Loop = v.InferOutput<typeof LoopSchema>;
export type DiagramShape = v.InferOutput<typeof DiagramShapeSchema>;
export type Diagram = v.InferOutput<typeof DiagramSchema>;

function toIssuePath(root: unknown, path: IntegrityPath): [v.IssuePathItem, ...v.IssuePathItem[]] {
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
}
