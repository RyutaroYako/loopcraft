// 副作用だけの import。消すと、型の不一致などスキーマ自体が出す検証メッセージが英語に戻る
import "@valibot/i18n/ja/schema";
import * as v from "valibot";
import { findIntegrityIssues } from "./integrity.ts";
import type { IntegrityPath } from "./integrity.ts";
import { placeMissingVariables } from "./layout.ts";
import {
  DIAGRAM_FORMAT_VERSION,
  DiagramSchema,
  DiagramShapeSchema,
  LinkSchema,
  LoopSchema,
  PointSchema,
  VariableSchema,
} from "./schema.ts";
import type { Diagram, DiagramShape, VariableId } from "./schema.ts";
import { closest } from "./suggest.ts";

export interface DiagramError {
  path: string | undefined;
  message: string;
  /** 直し方の候補 */
  hint?: string;
}

export type ParseDiagramResult =
  | {
      ok: true;
      diagram: Diagram;
      /** ファイルに座標が無く、読み込むときに配置した変数 */
      unplaced: VariableId[];
    }
  | { ok: false; errors: DiagramError[] };

export const createEmptyDiagram = (title = "無題のシステム図"): Diagram => {
  return v.parse(DiagramSchema, {
    version: DIAGRAM_FORMAT_VERSION,
    title,
    variables: [],
    links: [],
    loops: [],
  });
};

export const parseDiagramJson = (text: string): ParseDiagramResult => {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      errors: [
        { path: undefined, message: "JSON ファイルではないか、内容が壊れています" },
        { path: undefined, message: String(error) },
      ],
    };
  }
  const shape = v.safeParse(DiagramShapeSchema, input, { lang: "ja" });
  if (!shape.success) {
    // 形の誤りだけを返さないのは、それを直した後でやっと参照切れが分かり、往復が増えるため
    const salvaged = salvage(input);
    return {
      ok: false,
      errors: [
        ...shape.issues.map(describeIssue),
        ...(salvaged ? integrityErrors(salvaged.shape, salvaged.indexes) : []),
      ],
    };
  }
  const errors = integrityErrors(shape.output);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    diagram: placeMissingVariables(shape.output),
    unplaced: shape.output.variables.flatMap((variable) =>
      variable.position ? [] : [variable.id],
    ),
  };
};

export const formatDiagramError = (error: DiagramError): string => {
  const located = error.path ? `${error.path}: ${error.message}` : error.message;
  return error.hint ? `${located}（${error.hint}）` : located;
};

export const stringifyDiagram = (diagram: Diagram): string =>
  `${JSON.stringify(diagram, null, 2)}\n`;

type Collection = "variables" | "links" | "loops";

const keysOf = (schema: { pipe: readonly [{ entries: object }, ...unknown[]] }) =>
  Object.keys(schema.pipe[0].entries);

const KEYS = {
  diagram: keysOf(DiagramShapeSchema),
  variables: keysOf(VariableSchema),
  links: keysOf(LinkSchema),
  loops: keysOf(LoopSchema),
  point: keysOf(PointSchema),
};

const describeIssue = (issue: v.BaseIssue<unknown>): DiagramError => {
  const path = v.getDotPath(issue) ?? undefined;
  const keys = issue.path?.map((item) => item.key) ?? [];
  const last = keys.at(-1);
  if (typeof last !== "string") return { path, message: issue.message };
  if (issue.expected === "never") {
    const allowed = allowedKeys(keys.slice(0, -1));
    const near = allowed && closest(last, allowed);
    return {
      path,
      message: `知らないキー "${last}" です`,
      hint: near
        ? `"${near}" のことですか`
        : allowed
          ? `書けるキーは ${allowed.join(", ")} です`
          : undefined,
    };
  }
  if (issue.received === "undefined" && issue.expected === `"${last}"`) {
    // 場所をキーの親にするのは、links.0.polarity: "polarity" がありません、と同じ名前が 2 度並ぶため
    const parent = keys.slice(0, -1).join(".");
    return { path: parent || undefined, message: `"${last}" がありません` };
  }
  return { path, message: issue.message };
};

const allowedKeys = (parent: unknown[]) => {
  if (parent.length === 0) return KEYS.diagram;
  const [collection, , key] = parent;
  if (key === "position" || key === "marker") return KEYS.point;
  if (parent.length === 2 && typeof collection === "string" && collection in KEYS) {
    return KEYS[collection as Collection];
  }
  return undefined;
};

const integrityErrors = (
  shape: DiagramShape,
  indexes?: Record<Collection, number[]>,
): DiagramError[] =>
  findIntegrityIssues(shape).map((issue) => {
    const [collection, index, ...rest] = issue.path;
    const original =
      indexes && typeof index === "number" ? indexes[collection as Collection][index] : index;
    const path: IntegrityPath = [
      collection,
      ...(original === undefined ? [] : [original]),
      ...rest,
    ];
    return {
      path: path.join("."),
      message: issue.message,
      ...(issue.hint ? { hint: issue.hint } : {}),
    };
  });

/**
 * 形の合わない項目も外さずに調べるのは、参照に要る部分（ID・from・to・links）さえあれば参照切れは判定できるため。
 * 判定できない参照は報告しない。たとえば ID の読めない変数があるときに、その変数を指す関連を参照切れとすると、誤った直しをさせる
 */
const salvage = (
  input: unknown,
): { shape: DiagramShape; indexes: Record<Collection, number[]> } | undefined => {
  if (!isRecord(input)) return undefined;
  const { variables, links, loops } = input;
  if (!Array.isArray(variables) || !Array.isArray(links) || !Array.isArray(loops)) return undefined;
  const indexes: Record<Collection, number[]> = { variables: [], links: [], loops: [] };
  const pick = <T>(
    collection: Collection,
    items: unknown[],
    make: (item: Record<string, unknown>) => T | undefined,
  ) =>
    items.flatMap((item, at) => {
      const made = isRecord(item) && isId(item["id"]) ? make(item) : undefined;
      if (made === undefined) return [];
      indexes[collection].push(at);
      return [made];
    });
  const salvagedVariables = pick("variables", variables, (item) => ({
    id: item["id"] as string,
    label: typeof item["label"] === "string" ? item["label"] : "",
  }));
  const known = new Set(salvagedVariables.map((variable) => variable.id));
  const everyVariableKnown = salvagedVariables.length === variables.length;
  const salvagedLinks = pick("links", links, (item) =>
    isId(item["from"]) &&
    isId(item["to"]) &&
    (everyVariableKnown || (known.has(item["from"]) && known.has(item["to"])))
      ? { id: item["id"], from: item["from"], to: item["to"], polarity: "+" }
      : undefined,
  );
  const usable = new Set(salvagedLinks.map((link) => link.id));
  const unusable = new Set(
    links.flatMap((item) =>
      isRecord(item) && isId(item["id"]) && !usable.has(item["id"]) ? [item["id"]] : [],
    ),
  );
  const shape = {
    version: DIAGRAM_FORMAT_VERSION,
    title: "",
    variables: salvagedVariables,
    links: salvagedLinks,
    loops: pick("loops", loops, (item) =>
      Array.isArray(item["links"]) &&
      item["links"].every(isId) &&
      !item["links"].some((id) => unusable.has(id))
        ? { id: item["id"], name: "", links: item["links"] }
        : undefined,
    ),
  } as DiagramShape;
  return { shape, indexes };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isId = (value: unknown): value is string => typeof value === "string" && value !== "";
