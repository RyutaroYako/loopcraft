import type { AgentState } from "@loopcraft/core/agent";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { agentTurn } from "../testing/agent.ts";
import { createAgentClient } from "./agentClient.ts";

const session = {
  token: "t&k",
  file: "a.json",
  readonly: false,
  agent: { label: "Claude Code", version: "9.9.9" },
};

afterEach(() => vi.unstubAllGlobals());

describe("createAgentClient", () => {
  it("指示・停止・新しい会話・取り消しを、トークンを付けて送る", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetch);
    const client = createAgentClient(session, "http://serve");
    expect(client.info).toEqual(session.agent);
    expect(await client.prompt({ prompt: "足して" })).toEqual({ ok: true });
    await client.stop();
    await client.reset();
    await client.undo("turn-1");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "http://serve/api/agent/prompt",
      "http://serve/api/agent/stop",
      "http://serve/api/agent/reset",
      "http://serve/api/agent/undo",
    ]);
    expect(fetch.mock.calls[0]![1]).toMatchObject({
      method: "POST",
      headers: { "x-loopcraft-token": "t&k" },
      body: JSON.stringify({ prompt: "足して" }),
    });
    expect(fetch.mock.calls[3]![1].body).toBe(JSON.stringify({ turn: "turn-1" }));
  });

  it("今の状態で受け付けないときと、送れなかったときを分けて返す", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(new Response("壊れた", { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetch);
    const client = createAgentClient(session);
    expect(await client.prompt({ prompt: "足して" })).toEqual({ ok: false, reason: "rejected" });
    const messages = [];
    for (let i = 0; i < 3; i++) {
      const result = await client.stop();
      if (result.ok || result.reason !== "failed") throw new Error("失敗として返していない");
      messages.push((result.error as Error).message);
    }
    expect(messages).toEqual(["HTTP 500: 壊れた", "HTTP 502", "Failed to fetch"]);
  });

  it("会話の状態の知らせを受け、形の違う知らせは無視し、やめると接続を閉じる", () => {
    const sources: (EventTarget & { url: string; closed: boolean })[] = [];
    vi.stubGlobal(
      "EventSource",
      class extends EventTarget {
        closed = false;
        url: string;
        constructor(url: string) {
          super();
          this.url = url;
          sources.push(this);
        }
        close() {
          this.closed = true;
        }
      },
    );
    const states: AgentState[] = [];
    const stop = createAgentClient(session).watch((state) => states.push(state));
    const source = sources[0]!;
    expect(source.url).toBe("/api/agent/events?token=t%26k");
    const send = (data: unknown) => source.dispatchEvent(new MessageEvent("state", { data }));
    send(JSON.stringify({ turns: [agentTurn()] }));
    send("{");
    send(JSON.stringify({ turns: "x" }));
    send(undefined);
    expect(states).toEqual([{ turns: [agentTurn()] }]);
    stop();
    expect(source.closed).toBe(true);
  });
});
