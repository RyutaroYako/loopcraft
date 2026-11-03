import type { TurnActivity } from "@loopcraft/core/agent";
import * as v from "valibot";

export const CLAUDE_COMMAND = "claude";
export const CLAUDE_LABEL = "Claude Code";
export const MCP_SERVER_NAME = "loopcraft";

const READ_TOOLS = ["Read", "Grep", "Glob"];

export interface ClaudeRun {
  system: string;
  mcp: { url: string; token: string };
  /** 続ける会話の ID */
  resume?: string;
}

/**
 * 図を Bash の loopcraft edit で変えさせないのは、シェルを許すと、図やファイルに仕込まれた指示で、
 * 図の外まで書き換えられるため
 */
export function claudeArgs(run: ClaudeRun): string[] {
  const mcpConfig = {
    mcpServers: {
      [MCP_SERVER_NAME]: {
        type: "http",
        url: run.mcp.url,
        headers: { authorization: `Bearer ${run.mcp.token}` },
      },
    },
  };
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--system-prompt",
    run.system,
    "--permission-mode",
    "dontAsk",
    "--tools",
    ...READ_TOOLS,
    "--allowedTools",
    `mcp__${MCP_SERVER_NAME}`,
    ...READ_TOOLS,
    "--strict-mcp-config",
    "--mcp-config",
    JSON.stringify(mcpConfig),
    ...(run.resume ? ["--resume", run.resume] : []),
  ];
}

const TextPart = v.object({ type: v.literal("text"), text: v.string() });
const ToolUsePart = v.object({
  type: v.literal("tool_use"),
  name: v.string(),
  input: v.optional(v.unknown()),
});

const Line = v.variant("type", [
  v.object({ type: v.literal("system"), subtype: v.string(), session_id: v.optional(v.string()) }),
  v.object({
    type: v.literal("assistant"),
    message: v.object({
      content: v.array(v.union([TextPart, ToolUsePart, v.looseObject({ type: v.string() })])),
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
  | { kind: "tool"; activity: TurnActivity; path?: string }
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
  return output.message.content.flatMap((part): ClaudeEvent[] => {
    if (v.is(TextPart, part)) return part.text.trim() ? [{ kind: "text", text: part.text }] : [];
    if (v.is(ToolUsePart, part)) return [toolEvent(part.name, part.input)];
    return [];
  });
}

function toolEvent(name: string, input: unknown): ClaudeEvent {
  const tool = name.startsWith(`mcp__${MCP_SERVER_NAME}__`)
    ? name.slice(`mcp__${MCP_SERVER_NAME}__`.length)
    : name;
  if (tool === "get_diagram") return { kind: "tool", activity: "reading-diagram" };
  if (tool === "apply_operations" || tool === "layout")
    return { kind: "tool", activity: "editing" };
  if (tool === "check") return { kind: "tool", activity: "checking" };
  if (tool === "Read") {
    const path = v.safeParse(v.object({ file_path: v.string() }), input);
    return {
      kind: "tool",
      activity: "reading-files",
      ...(path.success ? { path: path.output.file_path } : {}),
    };
  }
  if (READ_TOOLS.includes(tool)) return { kind: "tool", activity: "reading-files" };
  return { kind: "tool", activity: "thinking" };
}

/** 会話を続けようとして、その会話が見つからなかった */
export const isSessionLost = (stderr: string) => /No conversation found/i.test(stderr);
