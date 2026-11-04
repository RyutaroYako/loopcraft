import { describe, expect, it } from "vite-plus/test";
import { handleMcpMessage } from "./mcp.ts";
import type { Tool } from "./tools.ts";

const echo: Tool = {
  name: "echo",
  description: "受けたものを返す",
  inputSchema: { type: "object" },
  run: async (input) =>
    (input as { fail?: boolean }).fail
      ? { ok: false, message: "失敗した" }
      : { ok: true, data: input },
};

const call = (method: string, params?: unknown) =>
  handleMcpMessage({ jsonrpc: "2.0", id: 1, method, params }, [echo]);

describe("handleMcpMessage", () => {
  it("相手の版で初期化し、版を言わなければ既定の版で応える", async () => {
    expect(await call("initialize", { protocolVersion: "2099-01-01" })).toMatchObject({
      id: 1,
      result: { protocolVersion: "2099-01-01", capabilities: { tools: {} } },
    });
    expect(await call("initialize")).toMatchObject({
      result: { protocolVersion: "2025-06-18" },
    });
  });

  it("ping と道具の一覧に応え、知らせには応えない", async () => {
    expect(await call("ping")).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
    expect(await call("tools/list")).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: [{ name: "echo", description: "受けたものを返す", inputSchema: { type: "object" } }],
      },
    });
    expect(
      await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, [echo]),
    ).toBeUndefined();
  });

  it("道具の結果を文字で返し、道具の失敗は isError で返す", async () => {
    expect(await call("tools/call", { name: "echo", arguments: { a: 1 } })).toMatchObject({
      result: { content: [{ type: "text", text: '{"a":1}' }] },
    });
    expect(await call("tools/call", { name: "echo" })).toMatchObject({
      result: { content: [{ type: "text", text: "{}" }] },
    });
    expect(await call("tools/call", { name: "echo", arguments: { fail: true } })).toMatchObject({
      result: { content: [{ type: "text", text: "失敗した" }], isError: true },
    });
  });

  it("形の違う要求、無い道具、知らない手続きはエラーで返す", async () => {
    expect(await handleMcpMessage({ id: 1 }, [echo])).toMatchObject({
      id: null,
      error: { code: -32600 },
    });
    expect(await call("tools/call", {})).toMatchObject({ error: { code: -32602 } });
    expect(await call("tools/call", { name: "nothing" })).toMatchObject({
      error: { code: -32602, message: "nothing という道具はありません" },
    });
    expect(await call("server/discover")).toMatchObject({ error: { code: -32601 } });
  });
});
