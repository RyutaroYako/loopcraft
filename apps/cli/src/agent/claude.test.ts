import { describe, expect, it } from "vite-plus/test";
import { diagramCommandOf, isSessionLost, parseClaudeLine } from "./claude.ts";

const assistant = (...content: unknown[]) => ({ type: "assistant", message: { content } });

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

  it("使った道具と、その結果を読む", () => {
    const tool = (name: string, input?: unknown) =>
      parseClaudeLine(assistant({ type: "tool_use", id: "t1", name, input }));
    expect(tool("Bash", { command: "loopcraft check diagram.json" })).toEqual([
      { kind: "tool", id: "t1", activity: "thinking", bash: "loopcraft check diagram.json" },
    ]);
    expect(tool("Read", { file_path: "README.md" })).toEqual([
      { kind: "tool", id: "t1", activity: "reading-files", path: "README.md" },
    ]);
    expect(tool("Read", {})).toEqual([{ kind: "tool", id: "t1", activity: "reading-files" }]);
    expect(tool("Grep", { pattern: "x" })).toEqual([
      { kind: "tool", id: "t1", activity: "reading-files" },
    ]);
    expect(tool("Bash", {})).toEqual([{ kind: "tool", id: "t1", activity: "thinking" }]);
    expect(tool("TodoWrite")).toEqual([{ kind: "tool", id: "t1", activity: "thinking" }]);
    expect(
      parseClaudeLine({
        type: "user",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "t1", content: "ok", is_error: true },
            { type: "text", text: "…" },
          ],
        },
      }),
    ).toEqual([{ kind: "tool-result", id: "t1" }]);
    expect(parseClaudeLine({ type: "user", message: { content: "指示" } })).toEqual([]);
  });

  it("形の違う行は読み飛ばす", () => {
    expect(parseClaudeLine({ type: "user" })).toEqual([]);
    expect(parseClaudeLine("text")).toEqual([]);
  });
});

describe("diagramCommandOf", () => {
  it("図のファイルに対して打った loopcraft のコマンドだけを見分ける", () => {
    expect(diagramCommandOf("loopcraft check diagram.json --format json", "diagram.json")).toBe(
      "check",
    );
    expect(diagramCommandOf("loopcraft edit diagram.json - <<< '{}'", "diagram.json")).toBe("edit");
    expect(diagramCommandOf("loopcraft layout 'my map.json' --all", "'my map.json'")).toBe(
      "layout",
    );
    expect(diagramCommandOf("loopcraft check other.json", "diagram.json")).toBeUndefined();
    expect(diagramCommandOf("loopcraft check diagram.json.bak", "diagram.json")).toBeUndefined();
    expect(diagramCommandOf("loopcraft render diagram.json", "diagram.json")).toBeUndefined();
    expect(diagramCommandOf("echo loopcraft check diagram.json", "diagram.json")).toBeUndefined();
  });
});

describe("isSessionLost", () => {
  it("続けようとした会話が見つからなかったかを、claude のエラー出力から見分ける", () => {
    expect(isSessionLost("Error: No conversation found with session ID: s1")).toBe(true);
    expect(isSessionLost("API Error: Overloaded")).toBe(false);
  });
});
