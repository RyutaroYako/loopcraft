import * as v from "valibot";
import {
  addLink,
  addVariable,
  featureLoop,
  removeLinks,
  removeLoop,
  removeVariable,
  setDescription,
  setTitle,
  updateLink,
  updateLoop,
  updateVariable,
} from "./edit.ts";
import { estimateNodeSizes } from "./geometry.ts";
import { autoLayout } from "./layout.ts";
import { DiagramSchema, PointSchema, PolaritySchema } from "./schema.ts";
import type { Diagram, Link, LinkId, LoopId, VariableId } from "./schema.ts";
import { cycleKey } from "./loop.ts";
import { closest } from "./suggest.ts";

/*
 * 図の JSON を書き換えさせるのでなく操作を並べさせるのは、
 * 変数を消したときの関連やループの後始末、ループの関連 ID の並べ方を、書き手が考えずに済むようにするため
 */

const Ref = v.pipe(v.string(), v.nonEmpty());
const Text = v.string();

const OperationSchema = v.variant("op", [
  v.strictObject({
    op: v.literal("add-variable"),
    id: v.optional(Ref),
    label: Text,
    description: v.optional(Text),
    position: v.optional(PointSchema),
  }),
  v.strictObject({
    op: v.literal("update-variable"),
    id: Ref,
    label: v.optional(Text),
    description: v.optional(Text),
    position: v.optional(PointSchema),
  }),
  v.strictObject({ op: v.literal("remove-variable"), id: Ref }),
  v.strictObject({
    op: v.literal("add-link"),
    id: v.optional(Ref),
    from: Ref,
    to: Ref,
    polarity: v.optional(PolaritySchema),
    delay: v.optional(v.boolean()),
    description: v.optional(Text),
  }),
  v.strictObject({
    op: v.literal("update-link"),
    id: v.optional(Ref),
    from: v.optional(Ref),
    to: v.optional(Ref),
    polarity: v.optional(PolaritySchema),
    delay: v.optional(v.boolean()),
    curvature: v.optional(v.nullable(v.number())),
    description: v.optional(Text),
  }),
  v.strictObject({
    op: v.literal("remove-link"),
    id: v.optional(Ref),
    from: v.optional(Ref),
    to: v.optional(Ref),
  }),
  v.strictObject({
    op: v.literal("add-loop"),
    id: v.optional(Ref),
    name: v.optional(Text),
    description: v.optional(Text),
    through: v.pipe(v.array(Ref), v.minLength(2)),
  }),
  v.strictObject({
    op: v.literal("update-loop"),
    id: Ref,
    name: v.optional(Text),
    description: v.optional(Text),
  }),
  v.strictObject({ op: v.literal("remove-loop"), id: Ref }),
  v.strictObject({ op: v.literal("set-title"), title: Text }),
  v.strictObject({ op: v.literal("set-description"), description: Text }),
]);

export type Operation = v.InferOutput<typeof OperationSchema>;

export const OPERATION_NAMES = OperationSchema.options.map((option) => option.entries.op.literal);

export interface OperationError {
  /** 何番目（0 始まり）の操作で止まったか。操作の組み合わせで整合性が崩れたときは無い */
  index?: number;
  message: string;
  hint?: string;
}

export type ApplyResult =
  | {
      ok: true;
      diagram: Diagram;
      /** 足した変数・関連・ループの ID。操作と同じ順 */
      ids: (string | null)[];
    }
  | { ok: false; error: OperationError };

class Failure extends Error {
  readonly hint: string | undefined;

  constructor(message: string, hint?: string) {
    super(message);
    this.hint = hint;
  }
}

export const parseOperation = (
  input: unknown,
): { ok: true; operation: Operation } | { ok: false; message: string; hint?: string } => {
  const result = v.safeParse(OperationSchema, input, { lang: "ja" });
  if (result.success) return { ok: true, operation: result.output };
  const issue = result.issues[0];
  const key = issue.path?.at(-1)?.key;
  if (issue.expected === "never" && typeof key === "string") {
    const option = OperationSchema.options.find(
      (item) => isRecord(input) && item.entries.op.literal === input["op"],
    );
    const near = option && closest(key, Object.keys(option.entries));
    return {
      ok: false,
      message: `知らないキー "${key}" です`,
      ...(near ? { hint: `"${near}" のことですか` } : {}),
    };
  }
  const op = isRecord(input) ? input["op"] : undefined;
  if (typeof op === "string" && !OPERATION_NAMES.includes(op as Operation["op"])) {
    const near = closest(op, OPERATION_NAMES);
    return {
      ok: false,
      message: `知らない操作 "${op}" です`,
      hint: near ? `"${near}" のことですか` : `使える操作は ${OPERATION_NAMES.join(", ")} です`,
    };
  }
  const path = v.getDotPath(issue);
  return { ok: false, message: path ? `${path}: ${issue.message}` : issue.message };
};

export const applyOperations = (start: Diagram, operations: readonly Operation[]): ApplyResult => {
  let diagram = start;
  const unplaced = new Set<VariableId>();
  const ids: (string | null)[] = [];
  for (const [index, operation] of operations.entries()) {
    try {
      const applied = apply(diagram, operation, unplaced);
      diagram = applied.diagram;
      ids.push(applied.id ?? null);
    } catch (error) {
      if (!(error instanceof Failure)) throw error;
      return {
        ok: false,
        error: { index, message: error.message, ...(error.hint ? { hint: error.hint } : {}) },
      };
    }
  }
  const placed = diagram.variables.filter((variable) => !unplaced.has(variable.id));
  if (unplaced.size > 0) {
    diagram = autoLayout(diagram, estimateNodeSizes(diagram.variables), {
      fixed: new Set(placed.map((variable) => variable.id)),
      // 置いた変数につながる曲がり具合を消さないのは、そこにある曲がり具合は、同じ操作の中で書き手が付けたものだけのため
      keepCurvature: new Set(
        diagram.links.flatMap((link) => (link.curvature === undefined ? [] : [link.id])),
      ),
    });
  }
  // 操作ごとの確認で済ませないのは、組み合わせで整合性が崩れることがあるため
  const checked = v.safeParse(DiagramSchema, diagram, { lang: "ja" });
  if (!checked.success) {
    const issue = checked.issues[0];
    return {
      ok: false,
      error: { message: `操作の組み合わせで ${v.getDotPath(issue) ?? ""}: ${issue.message}` },
    };
  }
  return { ok: true, diagram, ids };
};

/**
 * ID を省いたときに乱数で作らないのは、同じ操作から毎回同じ図ができ、読み手が ID を推測できるようにするため
 */
const nextId = (taken: readonly { id: string }[], base: string, numbered: boolean) => {
  const ids = new Set(taken.map((item) => item.id));
  if (!numbered && !ids.has(base)) return base;
  for (let at = numbered ? 1 : 2; ; at++) {
    const id = `${base}${numbered ? "" : "_"}${at}`;
    if (!ids.has(id)) return id;
  }
};

const apply = (
  diagram: Diagram,
  operation: Operation,
  unplaced: Set<VariableId>,
): { diagram: Diagram; id?: string } => {
  switch (operation.op) {
    case "add-variable": {
      const id = (operation.id ?? nextId(diagram.variables, "v", true)) as VariableId;
      if (operation.id && diagram.variables.some((variable) => variable.id === id)) {
        throw new Failure(
          `変数 "${id}" は既にあります`,
          "別の ID にするか、update-variable を使ってください",
        );
      }
      const added = addVariable(diagram, {
        id,
        label: operation.label,
        position: operation.position ?? { x: 0, y: 0 },
      });
      if (!operation.position) unplaced.add(added.id);
      const described = operation.description
        ? updateVariable(added.diagram, added.id, { description: operation.description })
        : added.diagram;
      return { diagram: described, id: added.id };
    }
    case "update-variable": {
      const id = variableRef(diagram, operation.id);
      if (operation.position) unplaced.delete(id);
      return {
        diagram: updateVariable(diagram, id, {
          ...(operation.label === undefined ? {} : { label: operation.label }),
          ...(operation.description === undefined
            ? {}
            : { description: operation.description || undefined }),
          ...(operation.position ? { position: operation.position } : {}),
        }),
      };
    }
    case "remove-variable": {
      const id = variableRef(diagram, operation.id);
      unplaced.delete(id);
      return { diagram: removeVariable(diagram, id) };
    }
    case "add-link": {
      if (operation.id && diagram.links.some((link) => link.id === operation.id)) {
        throw new Failure(
          `関連 "${operation.id}" は既にあります`,
          "別の ID にするか、update-link を使ってください",
        );
      }
      const from = variableRef(diagram, operation.from);
      const to = variableRef(diagram, operation.to);
      const id = (operation.id ?? nextId(diagram.links, `${from}_${to}`, false)) as LinkId;
      const added = addLink(diagram, { id, from, to, polarity: operation.polarity });
      if (!added.ok) {
        if (added.reason === "self") throw new Failure("自分自身への関連は作れません");
        throw new Failure(
          `"${from}" から "${to}" への関連は既にあります（"${added.existing}"）`,
          "極性などを変えるときは update-link を使ってください",
        );
      }
      return {
        diagram: updateLink(added.diagram, added.id, {
          ...(operation.delay ? { delay: true } : {}),
          ...(operation.description ? { description: operation.description } : {}),
        }),
        id: added.id,
      };
    }
    case "update-link": {
      const link = linkRef(diagram, operation);
      return {
        diagram: updateLink(diagram, link.id, {
          ...(operation.polarity ? { polarity: operation.polarity } : {}),
          ...(operation.delay === undefined ? {} : { delay: operation.delay || undefined }),
          ...(operation.curvature === undefined
            ? {}
            : { curvature: operation.curvature ?? undefined }),
          ...(operation.description === undefined
            ? {}
            : { description: operation.description || undefined }),
        }),
      };
    }
    case "remove-link":
      return { diagram: removeLinks(diagram, new Set([linkRef(diagram, operation).id])) };
    case "add-loop": {
      const id = (operation.id ?? nextId(diagram.loops, "loop", true)) as LoopId;
      if (operation.id && diagram.loops.some((loop) => loop.id === id)) {
        throw new Failure(
          `ループ "${id}" は既にあります`,
          "別の ID にするか、update-loop を使ってください",
        );
      }
      const through = operation.through.map((ref) => variableRef(diagram, ref));
      const links = through.map((from, at) => {
        const to = through[(at + 1) % through.length]!;
        const link = diagram.links.find((item) => item.from === from && item.to === to);
        if (!link) {
          throw new Failure(
            `"${from}" から "${to}" への関連がありません`,
            "through には、関連を辿る順に変数を並べます。最後の変数から最初の変数への関連も要ります",
          );
        }
        return link.id;
      });
      if (new Set(through).size !== through.length) {
        throw new Failure("同じ変数を 2 回通っています", "2 つのループに分けて足してください");
      }
      // 既にあるループを返して済ませないのは、渡した id や name が黙って捨てられ、後の操作がその id を見失うため
      const key = cycleKey(links);
      const existing = diagram.loops.find((loop) => cycleKey(loop.links) === key);
      if (existing) {
        throw new Failure(
          `同じ経路のループが既に "${existing.id}" としてあります`,
          `名前を変えるときは {"op":"update-loop","id":"${existing.id}","name":"…"} を使ってください`,
        );
      }
      const featured = featureLoop(diagram, links, { id, name: operation.name ?? "" });
      const described = operation.description
        ? updateLoop(featured.diagram, featured.id, { description: operation.description })
        : featured.diagram;
      return { diagram: described, id: featured.id };
    }
    case "update-loop": {
      const id = loopRef(diagram, operation.id);
      return {
        diagram: updateLoop(diagram, id, {
          ...(operation.name === undefined ? {} : { name: operation.name }),
          ...(operation.description === undefined
            ? {}
            : { description: operation.description || undefined }),
        }),
      };
    }
    case "remove-loop":
      return { diagram: removeLoop(diagram, loopRef(diagram, operation.id)) };
    case "set-title":
      return { diagram: setTitle(diagram, operation.title) };
    case "set-description":
      return { diagram: setDescription(diagram, operation.description) };
  }
};

/** 書き手がラベルで指しても通すのは、ID を覚えていなくても操作を書けるようにするため */
const variableRef = (diagram: Diagram, ref: string): VariableId => {
  const byId = diagram.variables.find((variable) => variable.id === ref);
  if (byId) return byId.id;
  const byLabel = diagram.variables.filter((variable) => variable.label === ref);
  if (byLabel.length === 1) return byLabel[0]!.id;
  if (byLabel.length > 1) {
    throw new Failure(
      `"${ref}" というラベルの変数が ${byLabel.length} 個あります`,
      `ID で指してください: ${byLabel.map((variable) => variable.id).join(", ")}`,
    );
  }
  const near = closest(ref, [
    ...diagram.variables.map((variable) => variable.id),
    ...diagram.variables.map((variable) => variable.label),
  ]);
  throw new Failure(`変数 "${ref}" はありません`, near ? `"${near}" のことですか` : undefined);
};

const linkRef = (diagram: Diagram, ref: { id?: string; from?: string; to?: string }): Link => {
  if (ref.id !== undefined) {
    const link = diagram.links.find((item) => item.id === ref.id);
    const mismatched =
      link &&
      ((ref.from !== undefined && variableRef(diagram, ref.from) !== link.from) ||
        (ref.to !== undefined && variableRef(diagram, ref.to) !== link.to));
    if (link && mismatched) {
      throw new Failure(
        `関連 "${link.id}" は "${link.from}" から "${link.to}" への関連で、from・to と食い違っています`,
        "id か、from と to の組の、どちらか一方で指してください",
      );
    }
    if (link) return link;
    const near = closest(
      ref.id,
      diagram.links.map((item) => item.id),
    );
    throw new Failure(`関連 "${ref.id}" はありません`, near ? `"${near}" のことですか` : undefined);
  }
  if (ref.from === undefined || ref.to === undefined) {
    throw new Failure("関連は id か、from と to の組で指してください");
  }
  const from = variableRef(diagram, ref.from);
  const to = variableRef(diagram, ref.to);
  const link = diagram.links.find((item) => item.from === from && item.to === to);
  if (!link) throw new Failure(`"${from}" から "${to}" への関連はありません`);
  return link;
};

const loopRef = (diagram: Diagram, ref: string): LoopId => {
  const byId = diagram.loops.find((item) => item.id === ref);
  if (byId) return byId.id;
  const byName = diagram.loops.filter((item) => item.name !== "" && item.name === ref);
  if (byName.length === 1) return byName[0]!.id;
  if (byName.length > 1) {
    throw new Failure(
      `"${ref}" という名前のループが ${byName.length} 個あります`,
      `ID で指してください: ${byName.map((loop) => loop.id).join(", ")}`,
    );
  }
  const near = closest(ref, [
    ...diagram.loops.map((item) => item.id),
    ...diagram.loops.map((item) => item.name),
  ]);
  throw new Failure(`ループ "${ref}" はありません`, near ? `"${near}" のことですか` : undefined);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
