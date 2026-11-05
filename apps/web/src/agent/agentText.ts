import type {
  AgentChange,
  AgentSelection,
  Turn,
  TurnActivity,
  TurnItem,
} from "@loopcraft/core/agent";
import type { Polarity } from "@loopcraft/core/schema";
import type { Selection } from "../editor/emphasis.ts";
import { labelOf } from "../editor/labels.ts";
import type { Editor } from "../editor/useEditor.ts";

export const ACTIVITY_TEXT: Record<TurnActivity, string> = {
  thinking: "考えています",
  "reading-diagram": "図を読んでいます",
  "reading-files": "ファイルを読んでいます",
  editing: "図を変えています",
  checking: "ループと配置を確かめています",
};

export const SELECTION_KIND_TEXT: Record<AgentSelection["kind"], string> = {
  variable: "変数",
  link: "関連",
  loop: "ループ",
};

export type StepRow =
  | { kind: "variable"; action: string; label: string }
  | { kind: "rename"; action: string; before: string; after: string }
  | { kind: "link"; action: string; from: string; to: string; polarity: Polarity }
  | { kind: "note"; action: string; text: string };

/**
 * key は、ブロックや行が始まった項目の位置から作る。項目は後ろに足されるだけなので、描き直しても変わらない
 */
export type TurnBlock =
  | { kind: "text"; key: string; text: string }
  | { kind: "steps"; key: string; rows: (StepRow & { key: string })[] };

const linkRow = ({ from, to, polarity }: { from: string; to: string; polarity: Polarity }) => ({
  kind: "link" as const,
  from,
  to,
  polarity,
});

const changeRow = (change: AgentChange): StepRow => {
  switch (change.kind) {
    case "variable-added":
      return { kind: "variable", action: "変数を追加", label: change.label };
    case "variable-removed":
      return { kind: "variable", action: "変数を削除", label: change.label };
    case "variable-renamed":
      return { kind: "rename", action: "名前を変更", before: change.before, after: change.after };
    case "variables-moved":
      return { kind: "note", action: "配置を変更", text: `変数 ${change.count} 個` };
    case "link-added":
      return { ...linkRow(change), action: "関連を追加" };
    case "link-changed":
      return { ...linkRow(change), action: "関連を変更" };
    case "link-removed":
      return { ...linkRow(change), action: "関連を削除" };
    case "loop-featured":
      return { kind: "note", action: "ループに注目", text: change.name };
    case "loop-unfeatured":
      return { kind: "note", action: "注目から外す", text: change.name };
    case "title-changed":
      return { kind: "note", action: "題名を変更", text: change.title };
    case "details-changed":
      return { kind: "note", action: "説明などを変更", text: `${change.count} か所` };
  }
};

const stepRows = (item: Exclude<TurnItem, { kind: "text" }>): StepRow[] => {
  if (item.kind === "changes") return item.changes.map(changeRow);
  if (item.kind === "read") return [{ kind: "note", action: "ファイルを読む", text: item.path }];
  const loops = `ループ R ${item.loops.R}・B ${item.loops.B}`;
  const layout = item.errors === 0 ? "配置の崩れなし" : `配置の崩れ ${item.errors} 件`;
  return [{ kind: "note", action: "確かめた", text: `${loops}、${layout}` }];
};

/** 続けて並ぶ作業を 1 つの一覧にまとめる */
export const blocksOf = (items: readonly TurnItem[]): TurnBlock[] => {
  const blocks: TurnBlock[] = [];
  for (const [index, item] of items.entries()) {
    if (item.kind === "text") {
      blocks.push({ kind: "text", key: `${index}`, text: item.text });
      continue;
    }
    const rows = stepRows(item).map((row, at) => ({ ...row, key: `${index}-${at}` }));
    const last = blocks.at(-1);
    if (last?.kind === "steps") last.rows.push(...rows);
    else blocks.push({ kind: "steps", key: `${index}`, rows });
  }
  return blocks;
};

export const elapsedText = (turn: Turn) => {
  if (turn.endedAt === undefined) return undefined;
  const seconds = Math.max(1, Math.round((turn.endedAt - turn.startedAt) / 1000));
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
};

export const describeSelection = (
  editor: Editor,
  selection: Selection | null,
): AgentSelection | undefined => {
  if (!selection) return undefined;
  if (selection.kind === "variable") {
    return { kind: "variable", id: selection.id, label: labelOf(editor, selection.id) };
  }
  if (selection.kind === "link") {
    const link = editor.linkById.value.get(selection.id);
    if (!link) return undefined;
    const label = `${labelOf(editor, link.from)} → ${labelOf(editor, link.to)}`;
    return { kind: "link", id: selection.id, label };
  }
  const loop = editor.loopEntryByLoopId.value.get(selection.id)?.featured?.loop;
  return loop ? { kind: "loop", id: selection.id, label: loop.name || "ループ" } : undefined;
};
