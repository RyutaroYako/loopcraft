import { isRunning } from "@loopcraft/core/agent";
import type { AgentSelection, AgentState, PromptRequest } from "@loopcraft/core/agent";
import { messageOf } from "../notice/errors.ts";
import type { Notice } from "../notice/useNotices.ts";
import type { AgentClient } from "./agentClient.ts";

export interface AgentView {
  state: AgentState;
  /** 指示を送ってから、サーバーがその指示を始めたと知らせるまで */
  sending: boolean;
}

export interface AgentSessionOptions {
  /** 送る前に、画面の変更を確定してファイルに書く。書けなければ false */
  prepare(): Promise<boolean>;
  onView(view: AgentView): void;
  notify(notice: Notice): void;
}

/** 始まりの知らせが届かないまま、画面を読み取り専用にしておく長さ */
const START_TIMEOUT_MS = 10_000;

export const createAgentSession = (client: AgentClient, options: AgentSessionOptions) => {
  let state: AgentState = { turns: [] };
  let sending = false;
  /** 送った指示が始まったと分かる、会話の長さ。始まりの知らせは、送った応答より先に届くことがある */
  let awaited: number | undefined;
  let giveUp: ReturnType<typeof setTimeout> | undefined;

  const waiting = () => awaited !== undefined && state.turns.length < awaited;
  const emit = () => options.onView({ state, sending: sending || waiting() });

  const failed = (title: string, error: unknown) =>
    options.notify({ tone: "error", title, details: [messageOf(error)] });

  return {
    view: (): AgentView => ({ state, sending: sending || waiting() }),
    locked: () => sending || waiting() || isRunning(state),
    start: () => {
      const stop = client.watch((next) => {
        state = next;
        if (!waiting()) awaited = undefined;
        emit();
      });
      return () => {
        clearTimeout(giveUp);
        stop();
      };
    },
    /** 受け付けられたら true。入力欄を空にしてよい */
    send: async (prompt: string, selection: AgentSelection | undefined): Promise<boolean> => {
      if (sending || waiting() || isRunning(state)) return false;
      sending = true;
      emit();
      try {
        if (!(await options.prepare())) {
          options.notify({ tone: "error", title: "図を保存できないため、AI に頼めません" });
          return false;
        }
        const request: PromptRequest = { prompt, ...(selection ? { selection } : {}) };
        const count = state.turns.length;
        const result = await client.prompt(request);
        if (!result.ok) {
          if (result.reason === "rejected") {
            options.notify({ tone: "error", title: "AI がほかの指示を進めています" });
          } else failed("AI に指示を送れませんでした", result.error);
          return false;
        }
        awaited = count + 1;
        clearTimeout(giveUp);
        // いつまでも待たないのは、知らせの接続が切れていると、読み取り専用のまま戻れなくなるため
        giveUp = setTimeout(() => {
          awaited = undefined;
          emit();
        }, START_TIMEOUT_MS);
        return true;
      } finally {
        sending = false;
        emit();
      }
    },
    stop: async () => {
      const result = await client.stop();
      if (!result.ok && result.reason === "failed")
        failed("AI を止められませんでした", result.error);
    },
    reset: async () => {
      const result = await client.reset();
      if (!result.ok && result.reason === "failed") {
        failed("新しい会話を始められませんでした", result.error);
      }
    },
    undo: async (turn: string) => {
      const result = await client.undo(turn);
      if (result.ok) return;
      if (result.reason === "rejected") {
        options.notify({ tone: "error", title: "その後に図が変わったため、取り消せません" });
      } else failed("指示の変更を取り消せませんでした", result.error);
    },
  };
};

export type AgentSession = ReturnType<typeof createAgentSession>;
