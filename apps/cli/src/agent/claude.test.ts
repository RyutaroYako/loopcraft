import { describe, expect, it } from "vite-plus/test";
import { isSessionLost, parseClaudeLine } from "./claude.ts";

const assistant = (...content: unknown[]) => ({ type: "assistant", message: { content } });
const toolUse = (name: string, input?: unknown) => assistant({ type: "tool_use", name, input });

describe("parseClaudeLine", () => {
  it("初めの行から会話の ID を読み、ほかの system の行は読み飛ばす", () => {
    expect(parseClaudeLine({ type: "system", subtype: "init", session_id: "s1" })).toEqual([
      { kind: "session", id: "s1" },
    ]);
    expect(parseClaudeLine({ type: "system", subtype: "init" })).toEqual([]);
    expect(parseClaudeLine({ type: "system", subtype: "hook", session_id: "s1" })).toEqual([]);
  });

  it("終わりの行から、失敗したかと返答を読む", () => {
    expect(parseClaudeLine({ type: "result", is_error: true, result: "Overloaded" })).toEqual([
      { kind: "result", isError: true, text: "Overloaded" },
    ]);
    expect(parseClaudeLine({ type: "result", is_error: false })).toEqual([
      { kind: "result", isError: false },
    ]);
  });

  it("返答の文を読み、空白だけの文と知らない部分は読み飛ばす", () => {
    expect(
      parseClaudeLine(
        assistant(
          { type: "text", text: "足します" },
          { type: "text", text: " \n" },
          { type: "thinking", thinking: "…" },
        ),
      ),
    ).toEqual([{ kind: "text", text: "足します" }]);
  });

  it("使った道具から、していることを読む", () => {
    const activity = (name: string, input?: unknown) => parseClaudeLine(toolUse(name, input));
    expect(activity("mcp__loopcraft__get_diagram")).toEqual([
      { kind: "tool", activity: "reading-diagram" },
    ]);
    expect(activity("mcp__loopcraft__apply_operations")).toEqual([
      { kind: "tool", activity: "editing" },
    ]);
    expect(activity("mcp__loopcraft__layout")).toEqual([{ kind: "tool", activity: "editing" }]);
    expect(activity("mcp__loopcraft__check")).toEqual([{ kind: "tool", activity: "checking" }]);
    expect(activity("Read", { file_path: "README.md" })).toEqual([
      { kind: "tool", activity: "reading-files", path: "README.md" },
    ]);
    expect(activity("Read", {})).toEqual([{ kind: "tool", activity: "reading-files" }]);
    expect(activity("Grep", { pattern: "x" })).toEqual([
      { kind: "tool", activity: "reading-files" },
    ]);
    expect(activity("TodoWrite")).toEqual([{ kind: "tool", activity: "thinking" }]);
  });

  it("形の違う行は読み飛ばす", () => {
    expect(parseClaudeLine({ type: "user" })).toEqual([]);
    expect(parseClaudeLine("text")).toEqual([]);
  });
});

describe("isSessionLost", () => {
  it("続けようとした会話が見つからなかったかを、claude のエラー出力から見分ける", () => {
    expect(isSessionLost("Error: No conversation found with session ID: s1")).toBe(true);
    expect(isSessionLost("API Error: Overloaded")).toBe(false);
  });
});
