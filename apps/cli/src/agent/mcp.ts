import * as v from "valibot";
import { readVersion } from "../version.ts";
import type { Tool } from "./tools.ts";

/*
 * SDK（@modelcontextprotocol/sdk）を使わないのは、使うのが initialize・tools/list・tools/call だけで、
 * 公開する CLI に重い依存を足すほどではないため
 */

const FALLBACK_PROTOCOL_VERSION = "2025-06-18";

const Message = v.object({
  jsonrpc: v.literal("2.0"),
  id: v.optional(v.union([v.string(), v.number()])),
  method: v.string(),
  params: v.optional(v.unknown()),
});

const InitializeParams = v.object({ protocolVersion: v.optional(v.string()) });
const CallParams = v.object({ name: v.string(), arguments: v.optional(v.unknown()) });

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INVALID_REQUEST = -32600;

/** 知らせ（id の無いもの）には応答しないので undefined を返す */
export async function handleMcpMessage(body: unknown, tools: readonly Tool[]) {
  const parsed = v.safeParse(Message, body);
  if (!parsed.success) return rpcError(null, INVALID_REQUEST, "JSON-RPC 2.0 の要求ではありません");
  const { id, method, params } = parsed.output;
  if (id === undefined) return undefined;
  if (method === "initialize") {
    const requested = v.safeParse(InitializeParams, params);
    return result(id, {
      // 対応する版の一覧と突き合わせないのは、使う機能（tools）がどの版でも同じ形のため
      protocolVersion:
        (requested.success && requested.output.protocolVersion) || FALLBACK_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "loopcraft", version: readVersion() },
    });
  }
  if (method === "ping") return result(id, {});
  if (method === "tools/list") {
    return result(id, {
      tools: tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    });
  }
  if (method === "tools/call") {
    const call = v.safeParse(CallParams, params);
    if (!call.success) return rpcError(id, INVALID_PARAMS, "name がありません");
    const tool = tools.find((item) => item.name === call.output.name);
    if (!tool) return rpcError(id, INVALID_PARAMS, `${call.output.name} という道具はありません`);
    const outcome = await tool
      .run(call.output.arguments ?? {})
      .catch((error: unknown) => ({ ok: false as const, message: messageOf(error) }));
    return result(
      id,
      outcome.ok
        ? { content: [{ type: "text", text: JSON.stringify(outcome.data) }] }
        : { content: [{ type: "text", text: outcome.message }], isError: true },
    );
  }
  return rpcError(id, METHOD_NOT_FOUND, `${method} には対応していません`);
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const result = (id: string | number, value: unknown) => ({ jsonrpc: "2.0", id, result: value });

const rpcError = (id: string | number | null, code: number, message: string) => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});
