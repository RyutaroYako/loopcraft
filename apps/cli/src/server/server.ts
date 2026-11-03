import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { basename } from "node:path";
import { AGENT_WRITER, PromptRequestSchema, UndoRequestSchema } from "@loopcraft/core/agent";
import type { AgentInfo, AgentState } from "@loopcraft/core/agent";
import { CLIENT_HEADER, SaveRequestSchema, TOKEN_HEADER } from "@loopcraft/core/session";
import type { DocumentResponse, Revision, SaveResponse, Session } from "@loopcraft/core/session";
import * as v from "valibot";
import "@valibot/i18n/ja/schema";
import { createEmptyDiagram, formatDiagramError } from "@loopcraft/core/io";
import { createConversation } from "../agent/conversation.ts";
import type { Conversation } from "../agent/conversation.ts";
import { handleMcpMessage } from "../agent/mcp.ts";
import type { DiagramAccess } from "../agent/tools.ts";
import { currentRevision, readDiagramFile, writeDiagramFile } from "../files.ts";
import type { Logger } from "../log.ts";
import {
  describeError,
  headerValue,
  isAllowedHost,
  readBody,
  sameToken,
  sendJson,
  sendText,
} from "./http.ts";
import { serveStatic } from "./static.ts";
import { watchFile } from "./watch.ts";
import type { FileWatch } from "./watch.ts";

export interface ServerOptions {
  /** 絶対パス */
  file: string;
  webDir: string;
  host?: string;
  /** 0 なら空いているポートを使う */
  port: number;
  readonly: boolean;
  sample?: boolean;
  log: Logger;
  token?: string;
  /** 図を変えさせる手元の AI。読み取り専用のときは使わない */
  agent?: { command: string; info: AgentInfo; cwd: string };
}

export interface RunningServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

const HEARTBEAT_MS = 25_000;

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  // 0.0.0.0 で待ち受けないのは、同じネットワークの他の端末からファイルを書き換えられてしまうため
  const host = options.host ?? "127.0.0.1";
  const token = options.token ?? randomBytes(24).toString("base64url");
  // 画面と同じトークンにしないのは、画面に埋め込んだトークンで AI の道具を直接呼ばせないため
  const mcpToken = randomBytes(24).toString("base64url");
  const agentOptions = options.readonly ? undefined : options.agent;
  const session: Session = {
    token,
    file: basename(options.file),
    readonly: options.readonly,
    ...(options.sample ? { sample: true } : {}),
    ...(agentOptions ? { agent: agentOptions.info } : {}),
  };
  const { log } = options;
  /** 最後に読んだか書いた版。外部での変更と自分の書き込みを見分ける */
  let knownRevision: Revision | null = null;
  try {
    knownRevision = await currentRevision(options.file);
  } catch (error) {
    // ここで止めないのは、読めない理由を画面が開いたときに /api/document で伝えるため
    log.warn(`${basename(options.file)} を読めません: ${describeError(error)}`);
  }
  const listeners = new Set<ServerResponse>();
  const agentListeners = new Set<ServerResponse>();
  /** 待ち受けてポートが決まってから作る。MCP の URL にポートが要る */
  let conversation: Conversation | undefined;
  let port = options.port;
  /** 並行に処理しないのは、版を確かめてから書き込むまでの間に別の保存が割り込むため */
  let saveQueue: Promise<void> = Promise.resolve();
  let unwatchedReason: string | undefined;
  /** knownRevision の内容を書いた画面。エディタ以外が書き換えたら null */
  let lastWriter: string | null = null;

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      log.error(`リクエストを処理できませんでした: ${describeError(error)}`);
      if (!response.headersSent) sendJson(response, 500, { error: describeError(error) });
      else response.end();
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse) {
    // 別のホスト名で解決させてローカルのサーバーを操作する攻撃（DNS リバインディング）を防ぐ
    if (!isAllowedHost(request.headers.host, port)) {
      sendText(response, 403, "Forbidden");
      return;
    }
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    if (url.pathname === "/mcp") {
      await handleMcp(request, response);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendText(response, 405, "Method Not Allowed");
      return;
    }
    await serveStatic(url, response, { webDir: options.webDir, token, session });
  }

  async function handleApi(request: IncomingMessage, response: ServerResponse, url: URL) {
    const given =
      url.pathname === "/api/events" || url.pathname === "/api/agent/events"
        ? url.searchParams.get("token")
        : headerValue(request.headers[TOKEN_HEADER]);
    if (!sameToken(given, token)) {
      sendJson(response, 403, { error: "invalid token" });
      return;
    }
    if (url.pathname === "/api/document" && request.method === "GET") {
      sendJson(response, 200, await documentResponse());
      return;
    }
    if (url.pathname === "/api/document" && request.method === "PUT") {
      const writer = headerValue(request.headers[CLIENT_HEADER]) ?? null;
      const saving = saveQueue.then(() => saveDocument(request, response, writer));
      saveQueue = saving.catch(() => {});
      await saving;
      return;
    }
    if (url.pathname === "/api/events" && request.method === "GET") {
      openEvents(response);
      return;
    }
    if (url.pathname.startsWith("/api/agent/")) {
      await handleAgent(request, response, url.pathname.slice("/api/agent/".length));
      return;
    }
    sendJson(response, 404, { error: "not found" });
  }

  async function handleMcp(request: IncomingMessage, response: ServerResponse) {
    const given = headerValue(request.headers.authorization)?.replace(/^Bearer /, "");
    if (!conversation || !sameToken(given, mcpToken)) {
      sendJson(response, 403, { error: "invalid token" });
      return;
    }
    // GET の SSE を開かないのは、サーバーから知らせることが無く、claude を待たせるだけのため
    if (request.method !== "POST") {
      sendText(response, 405, "Method Not Allowed");
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(await readBody(request));
    } catch (error) {
      sendJson(response, 400, { error: String(error) });
      return;
    }
    const reply = await handleMcpMessage(body, conversation.tools);
    if (reply === undefined) {
      response.writeHead(202);
      response.end();
      return;
    }
    sendJson(response, 200, reply);
  }

  async function handleAgent(request: IncomingMessage, response: ServerResponse, action: string) {
    if (!conversation) {
      sendJson(response, 404, { error: "AI は使えません" });
      return;
    }
    if (action === "events" && request.method === "GET") {
      openStream(response, agentListeners);
      response.write(`event: state\ndata: ${JSON.stringify(conversation.state())}\n\n`);
      return;
    }
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "method not allowed" });
      return;
    }
    if (action === "prompt") {
      const parsed = v.safeParse(PromptRequestSchema, await readJson(request), { lang: "ja" });
      if (!parsed.success) {
        sendJson(response, 400, { error: parsed.issues[0].message });
        return;
      }
      const sent = conversation.send(parsed.output);
      sendJson(response, sent.ok ? 202 : 409, sent);
      return;
    }
    if (action === "stop") {
      conversation.stop();
      sendJson(response, 200, { ok: true });
      return;
    }
    if (action === "reset") {
      const reset = conversation.reset();
      sendJson(response, reset.ok ? 200 : 409, reset);
      return;
    }
    if (action === "undo") {
      const parsed = v.safeParse(UndoRequestSchema, await readJson(request));
      if (!parsed.success) {
        sendJson(response, 400, { error: "turn がありません" });
        return;
      }
      const undone = await conversation.undo(parsed.output.turn);
      sendJson(response, undone.ok ? 200 : 409, undone);
      return;
    }
    sendJson(response, 404, { error: "not found" });
  }

  async function readJson(request: IncomingMessage): Promise<unknown> {
    try {
      return JSON.parse(await readBody(request));
    } catch {
      return undefined;
    }
  }

  async function documentResponse(): Promise<DocumentResponse> {
    // 読んだだけで knownRevision を進めないのは、見張りが外部の変更をほかの画面へ知らせる前に
    // 読み込みが割り込むと、その変更を知らせ損ねるため
    const loaded = await readDiagramFile(options.file);
    if (loaded.status === "ok") {
      return { status: "ok", diagram: loaded.diagram, revision: loaded.revision };
    }
    if (loaded.status === "invalid") {
      return { ...loaded, errors: loaded.errors.map(formatDiagramError) };
    }
    return loaded;
  }

  async function saveDocument(
    request: IncomingMessage,
    response: ServerResponse,
    writer: string | null,
  ) {
    if (options.readonly) {
      // 403 にしないのは、トークンの不一致と区別するため
      sendJson(response, 405, { error: "読み取り専用で開いているため保存できません" });
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(await readBody(request));
    } catch (error) {
      sendJson(response, 400, { error: String(error) });
      return;
    }
    const parsed = v.safeParse(SaveRequestSchema, body, { lang: "ja" });
    if (!parsed.success) {
      sendJson(response, 400, {
        error: "図の形式が正しくありません",
        issues: parsed.issues.map((issue) => `${v.getDotPath(issue) ?? ""}: ${issue.message}`),
      });
      return;
    }
    const { diagram, baseRevision, force } = parsed.output;
    const onDisk = await currentRevision(options.file);
    // 前提の版が古くても、今の内容を書いたのが同じ画面で、その後ほかから書き換えられていなければ、
    // 上書きしても誰の変更も失われない（応答を待ちきれずに送り直した保存など）
    const ownLatest = writer !== null && onDisk === knownRevision && lastWriter === writer;
    if (!force && onDisk !== baseRevision && !ownLatest) {
      sendJson(response, 409, { status: "conflict", revision: onDisk } satisfies SaveResponse);
      return;
    }
    const revision = await writeDiagramFile(options.file, diagram);
    knownRevision = revision;
    lastWriter = writer;
    log.success(`${session.file} に保存しました`);
    sendJson(response, 200, { status: "saved", revision } satisfies SaveResponse);
    // writer を付けないと、保存した画面が自分の保存をほかからの変更と取り違える
    broadcast("change", { revision, writer });
    conversation?.revisionChanged();
  }

  function openStream(response: ServerResponse, group: Set<ServerResponse>) {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    // ブラウザの既定（3〜5 秒）に任せないのは、一時的に切れたときにすぐつなぎ直すため
    response.write("retry: 1000\n: connected\n\n");
    group.add(response);
    response.on("close", () => group.delete(response));
  }

  function openEvents(response: ServerResponse) {
    openStream(response, listeners);
    // change を待たずに版を送るのは、切れている間の変更や見張りの停止を、
    // 後から開いた画面やつなぎ直した画面にも伝えるため
    response.write(
      `event: revision\ndata: ${JSON.stringify({ revision: knownRevision, writer: lastWriter })}\n\n`,
    );
    if (unwatchedReason !== undefined) {
      response.write(
        `event: watch-error\ndata: ${JSON.stringify({ reason: unwatchedReason })}\n\n`,
      );
    }
  }

  function broadcast(event: "change" | "watch-error" | "ping", data: unknown) {
    for (const listener of listeners) {
      listener.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  }

  function publishAgent(state: AgentState) {
    for (const listener of agentListeners) {
      listener.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
    }
  }

  /** 画面の保存と別に書かないのは、読んでから書くまでの間に、画面の保存が割り込むため */
  const access: DiagramAccess = {
    async read() {
      const loaded = await readDiagramFile(options.file);
      if (loaded.status === "ok") return loaded.diagram;
      if (loaded.status === "missing") return createEmptyDiagram();
      return {
        failure: `${session.file} を開けません\n${loaded.errors.map(formatDiagramError).join("\n")}`,
      };
    },
    update(change) {
      const updating = saveQueue.then(async () => {
        const before = await access.read();
        if ("failure" in before) return before;
        const after = change(before);
        if ("failure" in after) return after;
        if (after !== before) {
          const revision = await writeDiagramFile(options.file, after);
          knownRevision = revision;
          lastWriter = AGENT_WRITER;
          broadcast("change", { revision, writer: AGENT_WRITER });
        }
        return { before, after };
      });
      saveQueue = updating.then(
        () => {},
        () => {},
      );
      return updating;
    },
  };

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  port = (server.address() as AddressInfo).port;
  conversation = agentOptions
    ? createConversation({
        cwd: agentOptions.cwd,
        command: agentOptions.command,
        mcp: { url: `http://${host}:${port}/mcp`, token: mcpToken },
        access,
        revision: () => knownRevision,
        publish: publishAgent,
      })
    : undefined;

  // 待ち受けより先に見張らないのは、待ち受けに失敗したときに見張りが残るため
  let fileWatch: FileWatch;
  try {
    fileWatch = await watchFile(options.file, {
      changed: () => {
        currentRevision(options.file).then(
          (revision) => {
            if (revision === knownRevision) return;
            knownRevision = revision;
            lastWriter = null;
            log.warn(`${session.file} が外部で変更されました`);
            broadcast("change", { revision, writer: null });
            conversation?.revisionChanged();
          },
          (error: unknown) => log.warn(`${session.file} を読めません: ${describeError(error)}`),
        );
      },
      lost: (reason) => {
        unwatchedReason = reason;
        log.warn(
          `外部の変更を検知できなくなりました（${reason}）。serve を起動し直すまで、画面には反映されません`,
        );
        broadcast("watch-error", { reason });
      },
    });
  } catch (error) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw error;
  }

  // コメント行で済ませないのは、EventSource のイベントにならず、画面が生存を確かめられないため
  const heartbeat = setInterval(() => broadcast("ping", {}), HEARTBEAT_MS);

  return {
    url: `http://${host}:${port}/?token=${encodeURIComponent(token)}`,
    port,
    close: async () => {
      clearInterval(heartbeat);
      fileWatch.close();
      conversation?.close();
      for (const listener of [...listeners, ...agentListeners]) listener.end();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
