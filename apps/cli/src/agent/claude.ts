import type { TurnActivity } from "@loopcraft/core/agent";
import * as v from "valibot";

export const CLAUDE_COMMAND = "claude";
export const CLAUDE_LABEL = "Claude Code";

/** AI に打たせる loopcraft のコマンド */
export const DIAGRAM_COMMANDS = ["edit", "layout", "check"] as const;
export type DiagramCommand = (typeof DIAGRAM_COMMANDS)[number];

const READ_TOOLS = ["Read", "Grep", "Glob"];

export interface ClaudeRun {
  system: string;
  /** コマンドに書く図のパス。許可の規則と一字一句同じに打たせる */
  file: string;
  /** 続ける会話の ID */
  resume?: string;
}

/**
 * Bash をそのまま許さないのは、図やファイルに仕込まれた指示で、図の外まで書き換えられるため。
 * 手元の設定（--setting-sources）を読ませないのは、そこで許したコマンドまで AI が動かせるようになるため
 */
export function claudeArgs(run: ClaudeRun): string[] {
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--system-prompt",
    run.system,
    "--permission-mode",
    "dontAsk",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--tools",
    "Bash",
    ...READ_TOOLS,
    "--allowedTools",
    ...DIAGRAM_COMMANDS.map((command) => `Bash(loopcraft ${command} ${run.file}:*)`),
    ...READ_TOOLS,
    ...(run.resume ? ["--resume", run.resume] : []),
  ];
}

const TextPart = v.object({ type: v.literal("text"), text: v.string() });
const ToolUsePart = v.object({
  type: v.literal("tool_use"),
  id: v.string(),
  name: v.string(),
  input: v.optional(v.unknown()),
});
const ToolResultPart = v.object({ type: v.literal("tool_result"), tool_use_id: v.string() });
const OtherPart = v.looseObject({ type: v.string() });

const Line = v.variant("type", [
  v.object({ type: v.literal("system"), subtype: v.string(), session_id: v.optional(v.string()) }),
  v.object({
    type: v.literal("assistant"),
    message: v.object({ content: v.array(v.union([TextPart, ToolUsePart, OtherPart])) }),
  }),
  v.object({
    type: v.literal("user"),
    message: v.object({
      content: v.union([v.string(), v.array(v.union([ToolResultPart, OtherPart]))]),
    }),
  }),
  v.object({
    type: v.literal("result"),
    is_error: v.boolean(),
    result: v.optional(v.string()),
    session_id: v.optional(v.string()),
  }),
]);

export type ClaudeEvent =
  | { kind: "session"; id: string }
  | { kind: "text"; text: string }
  | {
      kind: "tool";
      id: string;
      activity: TurnActivity;
      /** Bash で打ったコマンド */
      bash?: string;
      /** 読んだファイル */
      path?: string;
    }
  | { kind: "tool-result"; id: string }
  | { kind: "result"; isError: boolean; text?: string };

export function parseClaudeLine(line: unknown): ClaudeEvent[] {
  const parsed = v.safeParse(Line, line);
  if (!parsed.success) return [];
  const output = parsed.output;
  if (output.type === "system") {
    return output.subtype === "init" && output.session_id
      ? [{ kind: "session", id: output.session_id }]
      : [];
  }
  if (output.type === "result") {
    return [
      {
        kind: "result",
        isError: output.is_error,
        ...(output.result === undefined ? {} : { text: output.result }),
      },
    ];
  }
  if (output.type === "user") {
    if (typeof output.message.content === "string") return [];
    return output.message.content.flatMap((part): ClaudeEvent[] =>
      v.is(ToolResultPart, part) ? [{ kind: "tool-result", id: part.tool_use_id }] : [],
    );
  }
  return output.message.content.flatMap((part): ClaudeEvent[] => {
    if (v.is(TextPart, part)) return part.text.trim() ? [{ kind: "text", text: part.text }] : [];
    if (v.is(ToolUsePart, part)) return [toolEvent(part.id, part.name, part.input)];
    return [];
  });
}

function toolEvent(id: string, name: string, input: unknown): ClaudeEvent {
  if (name === "Bash") {
    const command = v.safeParse(v.object({ command: v.string() }), input);
    return {
      kind: "tool",
      id,
      activity: "thinking",
      ...(command.success ? { bash: command.output.command } : {}),
    };
  }
  if (name === "Read") {
    const path = v.safeParse(v.object({ file_path: v.string() }), input);
    return {
      kind: "tool",
      id,
      activity: "reading-files",
      ...(path.success ? { path: path.output.file_path } : {}),
    };
  }
  if (READ_TOOLS.includes(name)) return { kind: "tool", id, activity: "reading-files" };
  return { kind: "tool", id, activity: "thinking" };
}

/** 図のファイルに対して打った loopcraft のコマンド。ほかのファイルやコマンドなら undefined */
export function diagramCommandOf(bash: string, file: string): DiagramCommand | undefined {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = new RegExp(
    `^\\s*loopcraft\\s+(${DIAGRAM_COMMANDS.join("|")})\\s+${escaped}(?=\\s|$)`,
  ).exec(bash);
  return found?.[1] as DiagramCommand | undefined;
}

/** 会話を続けようとして、その会話が見つからなかった */
export const isSessionLost = (stderr: string) => /No conversation found/i.test(stderr);
