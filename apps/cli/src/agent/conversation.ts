import { randomUUID } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import { changesOf, touchedBy } from "@loopcraft/core/agent";
import type { AgentState, PromptRequest, Turn } from "@loopcraft/core/agent";
import { diffDiagrams } from "@loopcraft/core/diff";
import type { Diagram } from "@loopcraft/core/schema";
import type { Revision } from "@loopcraft/core/session";
import { describeError } from "../server/http.ts";
import { countKinds, describeLoops, layoutReport } from "../summary.ts";
import { claudeArgs, diagramCommandOf, isSessionLost, parseClaudeLine } from "./claude.ts";
import type { ClaudeEvent } from "./claude.ts";
import { spawnJsonLines } from "./process.ts";
import { promptText, systemPrompt } from "./prompt.ts";

export interface DiagramFailure {
  failure: string;
}

export interface DiagramAccess {
  read(): Promise<Diagram | DiagramFailure>;
  /** 読んでから書くまでに、ほかの保存を割り込ませない */
  update(change: (current: Diagram) => Diagram | DiagramFailure): Promise<Diagram | DiagramFailure>;
}

export interface ConversationHost {
  cwd: string;
  command: string;
  /** 図のファイル。絶対パス */
  file: string;
  /** claude に渡す環境変数。PATH の先頭に、この serve の loopcraft を置いたもの */
  env: NodeJS.ProcessEnv;
  access: DiagramAccess;
  /** 今のファイルの版 */
  revision(): Revision | null;
  /** AI がファイルに書いた変更を取り込み、画面へ知らせる */
  sync(): Promise<void>;
  publish(state: AgentState): void;
  now?: () => number;
}

interface RunningTurn extends Omit<Turn, "undoable" | "touched"> {
  /** 指示の前の図。取り消すときに書き戻す */
  before: Diagram | null;
  /** 最後に見た図。次に読んだ図と比べて、変えた所を挙げる */
  seen: Diagram | null;
  /** この指示で最後に書いた版 */
  afterRevision?: Revision;
  touched: { variables: Set<string>; links: Set<string> };
  /** 結果を待っている Bash のコマンド */
  pending: Map<string, string>;
}

/** 許可の規則と同じ書き方にするため、作業しているフォルダの中ならそこからの相対パスにする */
function commandPath(cwd: string, file: string) {
  const inside = relative(cwd, file);
  const path = inside && !inside.startsWith("..") && !isAbsolute(inside) ? inside : file;
  return /[\s'"\\$`!*?&|;<>(){}[\]#~]/.test(path) ? `'${path.replaceAll("'", `'\\''`)}'` : path;
}

export function createConversation(host: ConversationHost) {
  const now = host.now ?? Date.now;
  const file = commandPath(host.cwd, host.file);
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
    const { before: _b, seen: _s, afterRevision: _a, pending: _p, touched, ...rest } = turn;
    return {
      ...rest,
      undoable: undoable(turn),
      touched: { variables: [...touched.variables], links: [...touched.links] },
    };
  };

  const state = (): AgentState => ({ turns: turns.map(view) });

  const publish = () => host.publish(state());

  const readDiagram = async () => {
    const current = await host.access.read();
    return "failure" in current ? null : current;
  };

  /** ファイルを読み、前に見た図から変わっていれば、変えた所として挙げる */
  const observe = async (turn: RunningTurn) => {
    const after = await readDiagram();
    if (!after || !turn.seen) return;
    const diff = diffDiagrams(turn.seen, after);
    turn.seen = after;
    if (!diff.changed) return;
    turn.items.push({ kind: "changes", changes: changesOf(diff) });
    const touched = touchedBy(diff);
    for (const id of touched.variables) turn.touched.variables.add(id);
    for (const id of touched.links) turn.touched.links.add(id);
    await host.sync();
    turn.afterRevision = host.revision() ?? undefined;
  };

  const check = async (turn: RunningTurn) => {
    const diagram = await readDiagram();
    if (!diagram) return;
    const { R, B } = countKinds(describeLoops(diagram).rows);
    turn.items.push({ kind: "checked", loops: { R, B }, errors: layoutReport(diagram).errors });
  };

  type Ending = Pick<Turn, "status" | "error">;

  /** 終わりを返すだけにして書き込まないのは、終わったと伝えるときに、していることの表示も同時に消すため */
  const apply = async (turn: RunningTurn, event: ClaudeEvent): Promise<Ending | undefined> => {
    switch (event.kind) {
      case "result":
        return event.isError
          ? { status: "failed", error: event.text?.trim() || "AI の CLI がエラーを返しました" }
          : { status: "done" };
      case "session":
        sessionId = event.id;
        return undefined;
      case "text":
        turn.items.push({ kind: "text", text: event.text.trim() });
        turn.activity = "thinking";
        break;
      case "tool": {
        const command = event.bash === undefined ? undefined : diagramCommandOf(event.bash, file);
        if (event.bash !== undefined) turn.pending.set(event.id, event.bash);
        if (command) turn.activity = command === "check" ? "checking" : "editing";
        else if (event.path && resolve(host.cwd, event.path) === host.file) {
          turn.activity = "reading-diagram";
        } else {
          turn.activity = event.activity;
          if (event.path) turn.items.push({ kind: "read", path: relative(host.cwd, event.path) });
        }
        break;
      }
      case "tool-result": {
        const bash = turn.pending.get(event.id);
        if (bash === undefined) return undefined;
        turn.pending.delete(event.id);
        // edit だけを見ないのは、別の書き方で図が変わっても、取り消しと一覧から漏らさないため
        await observe(turn);
        if (diagramCommandOf(bash, file) === "check") await check(turn);
        break;
      }
    }
    publish();
    return undefined;
  };

  const talk = async (turn: RunningTurn, signal: AbortSignal): Promise<Ending> => {
    const stdin = promptText(turn.prompt, turn.selection);
    // 一度だけやり直すのは、続けようとした会話が消えていたとき（claude 側で消した、別の端末で開いたなど）
    for (let attempt = 0; ; attempt++) {
      const resume = sessionId;
      const args = claudeArgs({ system: systemPrompt(file), file, resume });
      let ending: Ending | undefined;
      for await (const item of spawnJsonLines(host.command, args, {
        cwd: host.cwd,
        env: host.env,
        signal,
        stdin,
      })) {
        if ("line" in item) {
          for (const event of parseClaudeLine(item.line)) {
            ending = (await apply(turn, event)) ?? ending;
          }
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

  const run = async (turn: RunningTurn, signal: AbortSignal): Promise<Ending> => {
    turn.before = await readDiagram();
    turn.seen = turn.before;
    try {
      return await talk(turn, signal);
    } finally {
      // 止めたり失敗したりしても、それまでに変えた所は一覧に出し、取り消せるようにする
      await observe(turn);
    }
  };

  return {
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
        seen: null,
        touched: { variables: new Set(), links: new Set() },
        pending: new Map(),
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
      // キューに入る前の確認だけで済ませないのは、先に並んだ画面の保存を、指示の前の図で上書きしないため
      const restored = await host.access.update(() =>
        undoable(turn) ? before : { failure: "その後に図が変わりました" },
      );
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
