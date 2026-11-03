import { AgentStateSchema } from "@loopcraft/core/agent";
import type { AgentInfo, AgentState, PromptRequest } from "@loopcraft/core/agent";
import { TOKEN_HEADER } from "@loopcraft/core/session";
import type { Session } from "@loopcraft/core/session";
import * as v from "valibot";

export type AgentResult =
  | { ok: true }
  /** 別の指示が動いている、取り消せる状態でなくなったなど、今の状態では受け付けない */
  | { ok: false; reason: "rejected" }
  | { ok: false; reason: "failed"; error: unknown };

export interface AgentClient {
  info: AgentInfo;
  watch(onState: (state: AgentState) => void): () => void;
  prompt(request: PromptRequest): Promise<AgentResult>;
  stop(): Promise<AgentResult>;
  reset(): Promise<AgentResult>;
  undo(turn: string): Promise<AgentResult>;
}

const REQUEST_TIMEOUT_MS = 15_000;

export const createAgentClient = (
  session: Session & { agent: AgentInfo },
  base = "",
): AgentClient => {
  const post = async (action: string, body: unknown = {}): Promise<AgentResult> => {
    try {
      const response = await fetch(`${base}/api/agent/${action}`, {
        method: "POST",
        headers: { [TOKEN_HEADER]: session.token, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status === 409) return { ok: false, reason: "rejected" };
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text ? `HTTP ${response.status}: ${text}` : `HTTP ${response.status}`);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: "failed", error };
    }
  };

  return {
    info: session.agent,
    watch(onState) {
      const source = new EventSource(
        `${base}/api/agent/events?token=${encodeURIComponent(session.token)}`,
      );
      source.addEventListener("state", (event) => {
        const parsed = v.safeParse(AgentStateSchema, parseJson(event.data));
        if (parsed.success) onState(parsed.output);
      });
      return () => source.close();
    },
    prompt: (request) => post("prompt", request),
    stop: () => post("stop"),
    reset: () => post("reset"),
    undo: (turn) => post("undo", { turn }),
  };
};

const parseJson = (data: unknown) => {
  try {
    return typeof data === "string" ? (JSON.parse(data) as unknown) : undefined;
  } catch {
    return undefined;
  }
};
