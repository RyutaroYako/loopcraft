import * as v from "valibot";
import type { DiagramDiff, LinkSummary } from "./diff.ts";
import { PolaritySchema } from "./schema.ts";

/**
 * `loopcraft serve` が手元の AI（Claude Code など）に図を変えさせるときの、サーバーと画面の取り決め。
 * 会話の状態はサーバーが持ち、画面は丸ごと受け取って描く
 */

export const AGENT_WRITER = "agent";

export const AgentInfoSchema = v.object({
  /** 画面に出す名前（Claude Code） */
  label: v.string(),
  version: v.optional(v.string()),
});

export type AgentInfo = v.InferOutput<typeof AgentInfoSchema>;

export const AgentSelectionSchema = v.object({
  kind: v.picklist(["variable", "link", "loop"]),
  id: v.string(),
  label: v.string(),
});

export type AgentSelection = v.InferOutput<typeof AgentSelectionSchema>;

export const PromptRequestSchema = v.object({
  prompt: v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(20_000)),
  selection: v.optional(AgentSelectionSchema),
});

export type PromptRequest = v.InferOutput<typeof PromptRequestSchema>;

export const UndoRequestSchema = v.object({ turn: v.string() });

const Label = v.object({ label: v.string() });
const Route = v.object({ from: v.string(), to: v.string(), polarity: PolaritySchema });

export const AgentChangeSchema = v.variant("kind", [
  v.object({ kind: v.literal("variable-added"), ...Label.entries }),
  v.object({ kind: v.literal("variable-removed"), ...Label.entries }),
  v.object({ kind: v.literal("variable-renamed"), before: v.string(), after: v.string() }),
  v.object({ kind: v.literal("variables-moved"), count: v.number() }),
  v.object({ kind: v.literal("link-added"), ...Route.entries }),
  v.object({ kind: v.literal("link-removed"), ...Route.entries }),
  v.object({ kind: v.literal("link-changed"), ...Route.entries }),
  v.object({ kind: v.literal("loop-featured"), name: v.string() }),
  v.object({ kind: v.literal("loop-unfeatured"), name: v.string() }),
  v.object({ kind: v.literal("title-changed"), title: v.string() }),
  v.object({ kind: v.literal("details-changed"), count: v.number() }),
]);

export type AgentChange = v.InferOutput<typeof AgentChangeSchema>;

export const TurnItemSchema = v.variant("kind", [
  v.object({ kind: v.literal("text"), text: v.string() }),
  v.object({ kind: v.literal("changes"), changes: v.array(AgentChangeSchema) }),
  v.object({
    kind: v.literal("checked"),
    loops: v.object({ R: v.number(), B: v.number() }),
    /** 配置の崩れ（重なり・突き抜け）の数 */
    errors: v.number(),
  }),
  v.object({ kind: v.literal("read"), path: v.string() }),
]);

export type TurnItem = v.InferOutput<typeof TurnItemSchema>;

export const TurnActivitySchema = v.picklist([
  "thinking",
  "reading-diagram",
  "reading-files",
  "editing",
  "checking",
]);

export type TurnActivity = v.InferOutput<typeof TurnActivitySchema>;

export const TurnSchema = v.object({
  id: v.string(),
  prompt: v.string(),
  selection: v.optional(AgentSelectionSchema),
  status: v.picklist(["running", "done", "failed", "stopped"]),
  /** 動いている間だけ。今していること */
  activity: v.optional(TurnActivitySchema),
  items: v.array(TurnItemSchema),
  /** failed のときの、AI の CLI が出した理由 */
  error: v.optional(v.string()),
  startedAt: v.number(),
  endedAt: v.optional(v.number()),
  /** この指示で変えた図を、指示の前に戻せる。最後の指示で、その後に図が変わっていないときだけ */
  undoable: v.boolean(),
  undone: v.boolean(),
  /** この指示で足したり変えたりした変数と関連の ID */
  touched: v.object({ variables: v.array(v.string()), links: v.array(v.string()) }),
});

export type Turn = v.InferOutput<typeof TurnSchema>;

export const AgentStateSchema = v.object({ turns: v.array(TurnSchema) });

export type AgentState = v.InferOutput<typeof AgentStateSchema>;

export const isRunning = (state: AgentState) => state.turns.at(-1)?.status === "running";

export const changesOf = (diff: DiagramDiff): AgentChange[] => [
  ...(diff.title ? [{ kind: "title-changed" as const, title: diff.title.after }] : []),
  ...diff.variables.added.map(({ label }) => ({ kind: "variable-added" as const, label })),
  ...diff.variables.renamed.map(({ before, after }) => ({
    kind: "variable-renamed" as const,
    before,
    after,
  })),
  ...diff.variables.removed.map(({ label }) => ({ kind: "variable-removed" as const, label })),
  ...diff.links.added.map((link) => ({ kind: "link-added" as const, ...route(link) })),
  ...diff.links.changed.map((link) => ({ kind: "link-changed" as const, ...route(link) })),
  ...diff.links.removed.map((link) => ({ kind: "link-removed" as const, ...route(link) })),
  ...diff.featured.added.map((name) => ({ kind: "loop-featured" as const, name })),
  ...diff.featured.removed.map((name) => ({ kind: "loop-unfeatured" as const, name })),
  ...(diff.variables.moved > 0
    ? [{ kind: "variables-moved" as const, count: diff.variables.moved }]
    : []),
  ...(diff.other.length > 0
    ? [{ kind: "details-changed" as const, count: diff.other.length }]
    : []),
];

export const touchedBy = (diff: DiagramDiff): Turn["touched"] => ({
  variables: [...diff.variables.added, ...diff.variables.renamed].map(({ id }) => id),
  links: [...diff.links.added, ...diff.links.changed].map(({ id }) => id),
});

const route = ({ from, to, polarity }: LinkSummary) => ({ from, to, polarity });
