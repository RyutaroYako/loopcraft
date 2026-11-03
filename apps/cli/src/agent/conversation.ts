import { randomUUID } from "node:crypto";
import { relative } from "node:path";
import { changesOf, touchedBy } from "@loopcraft/core/agent";
import type { AgentState, PromptRequest, Turn } from "@loopcraft/core/agent";
import { diffDiagrams } from "@loopcraft/core/diff";
import type { Diagram } from "@loopcraft/core/schema";
import type { Revision } from "@loopcraft/core/session";
import { describeError } from "../server/http.ts";
import { claudeArgs, isSessionLost, parseClaudeLine } from "./claude.ts";
import type { ClaudeEvent } from "./claude.ts";
import { spawnJsonLines } from "./process.ts";
import { promptText, SYSTEM_PROMPT } from "./prompt.ts";
import { createTools } from "./tools.ts";
import type { DiagramAccess, Tool } from "./tools.ts";

export interface ConversationHost {
  cwd: string;
  command: string;
  mcp: { url: string; token: string };
  access: DiagramAccess;
  /** 今のファイルの版 */
  revision(): Revision | null;
  publish(state: AgentState): void;
  now?: () => number;
}

interface RunningTurn extends Omit<Turn, "undoable" | "touched"> {
  /** 指示の前の図。取り消すときに書き戻す */
  before: Diagram | null;
  /** この指示で最後に書いた版 */
  afterRevision?: Revision;
  touched: { variables: Set<string>; links: Set<string> };
}

export function createConversation(host: ConversationHost) {
  const now = host.now ?? Date.now;
  let turns: RunningTurn[] = [];
  let sessionId: string | undefined;
  let controller: AbortController | undefined;

  const running = () => {
    const last = turns.at(-1);
    return last?.status === "running" ? last : undefined;
  };

  const undoable = (turn: RunningTurn) =>
    turn === turns.at(-1) &&
    turn.status !== "running" &&
    !turn.undone &&
    turn.before !== null &&
    turn.afterRevision !== undefined &&
    turn.afterRevision === host.revision();

  const view = (turn: RunningTurn): Turn => {
    const { before: _before, afterRevision: _afterRevision, touched, ...rest } = turn;
    return {
      ...rest,
      undoable: undoable(turn),
      touched: { variables: [...touched.variables], links: [...touched.links] },
    };
  };

  const state = (): AgentState => ({ turns: turns.map(view) });

  const publish = () => host.publish(state());

  // 動いていないときに道具を断るのは、トークンを知る別のプログラムに、画面の知らないところで図を変えさせないため
  const guarded = (tool: Tool): Tool => ({
    ...tool,
    run: (input) =>
      running()
        ? tool.run(input)
        : Promise.resolve({ ok: false, message: "AI の実行中だけ使えます" }),
  });

  const tools = createTools(host.access, {
    changed(before, after) {
      const turn = running();
      if (!turn) return;
      const diff = diffDiagrams(before, after);
      if (!diff.changed) return;
      turn.items.push({ kind: "changes", changes: changesOf(diff) });
      const touched = touchedBy(diff);
      for (const id of touched.variables) turn.touched.variables.add(id);
      for (const id of touched.links) turn.touched.links.add(id);
      turn.afterRevision = host.revision() ?? undefined;
      publish();
    },
    checked(summary) {
      const turn = running();
      if (!turn) return;
      turn.items.push({ kind: "checked", ...summary });
      publish();
    },
  }).map(guarded);

  type Ending = Pick<Turn, "status" | "error">;

  /** 終わりを返すだけにして書き込まないのは、終わったと伝えるときに、していることの表示も同時に消すため */
  const apply = (turn: RunningTurn, event: ClaudeEvent): Ending | undefined => {
    if (event.kind === "result") {
      return event.isError
        ? { status: "failed", error: event.text?.trim() || "AI の CLI がエラーを返しました" }
        : { status: "done" };
    }
    if (event.kind === "session") {
      sessionId = event.id;
      return undefined;
    }
    if (event.kind === "text") {
      turn.items.push({ kind: "text", text: event.text.trim() });
      turn.activity = "thinking";
    } else {
      turn.activity = event.activity;
      if (event.path) turn.items.push({ kind: "read", path: relative(host.cwd, event.path) });
    }
    publish();
    return undefined;
  };

  const run = async (turn: RunningTurn, signal: AbortSignal): Promise<Ending> => {
    const current = await host.access.read();
    turn.before = "failure" in current ? null : current;
    const stdin = promptText(turn.prompt, turn.selection);
    // 一度だけやり直すのは、続けようとした会話が消えていたとき（claude 側で消した、別の端末で開いたなど）
    for (let attempt = 0; ; attempt++) {
      const resume = sessionId;
      const args = claudeArgs({ system: SYSTEM_PROMPT, mcp: host.mcp, resume });
      let ending: Ending | undefined;
      for await (const item of spawnJsonLines(host.command, args, {
        cwd: host.cwd,
        signal,
        stdin,
      })) {
        if ("line" in item) {
          for (const event of parseClaudeLine(item.line)) ending = apply(turn, event) ?? ending;
          continue;
        }
        const { exit } = item;
        if (exit.aborted) return { status: "stopped" };
        if (ending) return ending;
        if (resume && attempt === 0 && isSessionLost(exit.stderr)) {
          sessionId = undefined;
          break;
        }
        if (exit.code === 0) return { status: "done" };
        return {
          status: "failed",
          error: exit.stderr.split("\n").at(-1) || `終了コード ${exit.code ?? "なし"}`,
        };
      }
    }
  };

  return {
    tools,
    state,
    isRunning: () => running() !== undefined,
    send(request: PromptRequest): { ok: true } | { ok: false; reason: "busy" } {
      if (running()) return { ok: false, reason: "busy" };
      const turn: RunningTurn = {
        id: randomUUID(),
        prompt: request.prompt,
        ...(request.selection ? { selection: request.selection } : {}),
        status: "running",
        activity: "thinking",
        items: [],
        startedAt: now(),
        undone: false,
        before: null,
        touched: { variables: new Set(), links: new Set() },
      };
      turns = [...turns, turn];
      controller = new AbortController();
      const { signal } = controller;
      publish();
      void run(turn, signal)
        .catch((error: unknown): Ending => ({
          status: "failed",
          error: isNotInstalled(error) ? `${host.command} が見つかりません` : describeError(error),
        }))
        .then((ending) => {
          turn.status = ending.status;
          if (ending.error !== undefined) turn.error = ending.error;
          delete turn.activity;
          turn.endedAt = now();
          publish();
        });
      return { ok: true };
    },
    stop() {
      controller?.abort();
    },
    reset(): { ok: true } | { ok: false; reason: "busy" } {
      if (running()) return { ok: false, reason: "busy" };
      turns = [];
      sessionId = undefined;
      publish();
      return { ok: true };
    },
    async undo(id: string): Promise<{ ok: true } | { ok: false; reason: "stale" }> {
      const turn = turns.find((item) => item.id === id);
      if (!turn || !undoable(turn) || turn.before === null) return { ok: false, reason: "stale" };
      const before = turn.before;
      const restored = await host.access.update(() => before);
      if ("failure" in restored) return { ok: false, reason: "stale" };
      turn.undone = true;
      publish();
      return { ok: true };
    },
    /** 図が書き換わったら、取り消せるかどうかが変わるので知らせ直す */
    revisionChanged: publish,
    close() {
      controller?.abort();
    },
  };
}

export type Conversation = ReturnType<typeof createConversation>;

const isNotInstalled = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT";
