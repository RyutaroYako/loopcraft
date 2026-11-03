import type { AgentState, PromptRequest, Turn } from "@loopcraft/core/agent";
import type { AgentClient, AgentResult } from "../agent/agentClient.ts";

/** serve の代わりに、受けた指示を覚え、渡された会話の状態を画面へ流す */
export function fakeAgentClient() {
  let onState: ((state: AgentState) => void) | undefined;
  const control = {
    result: { ok: true } as AgentResult,
    prompts: [] as PromptRequest[],
    stops: 0,
    resets: 0,
    undone: [] as string[],
    push(...turns: Turn[]) {
      onState?.({ turns });
    },
  };
  const client: AgentClient = {
    info: { label: "Claude Code", version: "9.9.9" },
    watch(next) {
      onState = next;
      next({ turns: [] });
      return () => (onState = undefined);
    },
    prompt: async (request) => {
      control.prompts.push(request);
      return control.result;
    },
    stop: async () => {
      control.stops++;
      return { ok: true };
    },
    reset: async () => {
      control.resets++;
      return { ok: true };
    },
    undo: async (turn) => {
      control.undone.push(turn);
      return control.result;
    },
  };
  return { client, control };
}

export function agentTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: "turn-1",
    prompt: "離職数を減らす打ち手を足して",
    status: "running",
    activity: "thinking",
    items: [],
    startedAt: 0,
    undoable: false,
    undone: false,
    touched: { variables: [], links: [] },
    ...overrides,
  };
}
