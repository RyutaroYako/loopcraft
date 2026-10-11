import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { basename, dirname, extname, join, normalize, sep } from "node:path";
import {
  SESSION_META_NAME,
  CLIENT_HEADER,
  SaveRequestSchema,
  TOKEN_HEADER,
  type DocumentResponse,
  type Revision,
  type SaveResponse,
  type Session,
} from "@loopcraft/core/session";
import * as v from "valibot";
import "@valibot/i18n/ja/schema";
import { isNotFound, readDiagramFile, revisionOf, writeDiagramFile } from "../files.ts";
import type { Logger } from "../log.ts";

export interface ServerOptions {
  /** 編集するファイルの絶対パス */
  file: string;
  /** ビルド済みエディタのディレクトリ */
  webDir: string;
  host?: string;
  /** 0 なら空いているポートを使う */
  port: number;
  editable: boolean;
  readonly: boolean;
  log: Logger;
  token?: string;
}

export interface RunningServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const WATCH_DEBOUNCE_MS = 80;
const HEARTBEAT_MS = 25_000;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json; charset=utf-8",
};

/** 1 つのファイルを編集するためのローカルサーバー。127.0.0.1 だけで待ち受ける */
export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const host = options.host ?? "127.0.0.1";
  const token = options.token ?? randomBytes(24).toString("base64url");
  const session: Session = {
    token,
    file: basename(options.file),
    editable: options.editable && !options.readonly,
    readonly: options.readonly,
  };
  const { log } = options;
  /** 最後に読んだ・書いたファイルの版。外部での変更と自分の書き込みを見分ける */
  let knownRevision: Revision | null = null;
  try {
    knownRevision = await currentRevision(options.file);
  } catch (error) {
    // 読めない理由は、画面が開いたときに /api/document の応答で伝える
    log.warn(`${basename(options.file)} を読めません: ${describeError(error)}`);
  }
  const listeners = new Set<ServerResponse>();
  let port = options.port;
  /** 版を確かめてから書き込むまでの間に、別の保存が割り込まないよう 1 つずつ処理する */
  let saveQueue: Promise<void> = Promise.resolve();

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
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendText(response, 405, "Method Not Allowed");
      return;
    }
    await serveStatic(url, response);
  }

  async function handleApi(request: IncomingMessage, response: ServerResponse, url: URL) {
    const given =
      url.pathname === "/api/events"
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
    sendJson(response, 404, { error: "not found" });
  }

  async function documentResponse(): Promise<DocumentResponse> {
    // 読んだだけでは knownRevision を進めない。見張りが外部の変更をほかの画面へ知らせる前に
    // 読み込みが割り込むと、その変更を知らせ損ねるため
    const loaded = await readDiagramFile(options.file);
    if (loaded.status === "ok") {
      return { status: "ok", diagram: loaded.diagram, revision: loaded.revision };
    }
    return loaded;
  }

  async function saveDocument(
    request: IncomingMessage,
    response: ServerResponse,
    writer: string | null,
  ) {
    if (options.readonly) {
      sendJson(response, 403, { error: "読み取り専用で開いているため保存できません" });
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
    if (!force && onDisk !== baseRevision) {
      sendJson(response, 409, { status: "conflict", revision: onDisk } satisfies SaveResponse);
      return;
    }
    const revision = await writeDiagramFile(options.file, diagram);
    knownRevision = revision;
    log.success(`${session.file} に保存しました`);
    sendJson(response, 200, { status: "saved", revision } satisfies SaveResponse);
    // 同じファイルを開いているほかの画面に知らせる。保存した画面は writer で自分の保存と分かる
    broadcast("change", { revision, writer });
  }

  function openEvents(response: ServerResponse) {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    response.write(": connected\n\n");
    listeners.add(response);
    response.on("close", () => listeners.delete(response));
  }

  function broadcast(event: "change" | "watch-error", data: unknown) {
    for (const listener of listeners) {
      listener.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  }

  async function serveStatic(url: URL, response: ServerResponse) {
    const { pathname } = url;
    let relativePath: string;
    try {
      relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
    } catch {
      sendText(response, 400, "Bad Request");
      return;
    }
    const path = normalize(join(options.webDir, relativePath));
    if (path !== options.webDir && !path.startsWith(options.webDir + sep)) {
      sendText(response, 404, "Not Found");
      return;
    }
    const isIndex = path === join(options.webDir, "index.html");
    // トークンを埋め込んだ画面は、起動時に表示した URL（トークン付き）でしか開けない。
    // 同じマシンのほかの利用者がトークンを読み取って、ファイルを書き換えられないようにするため
    if (isIndex && !sameToken(url.searchParams.get("token"), token)) {
      sendText(response, 403, "loopcraft serve が表示した URL（token 付き）を開いてください");
      return;
    }
    let content: Buffer;
    try {
      content = await readFile(path);
    } catch {
      sendText(response, 404, "Not Found");
      return;
    }
    const type = CONTENT_TYPES[extname(path)] ?? "application/octet-stream";
    if (isIndex) {
      response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
      response.end(injectSession(content.toString("utf8"), session));
      return;
    }
    response.writeHead(200, { "content-type": type });
    response.end(content);
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  port = (server.address() as AddressInfo).port;

  // エディタ以外（git pull やほかのエディタ）がファイルを書き換えたら、開いている画面に知らせる。
  // 置き換え保存ではファイル自体が作り直されるので、ファイルではなくディレクトリを見る。
  // 待ち受けに失敗したときに監視が残らないよう、待ち受けを始めてから作る
  const directory = dirname(options.file);
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let watching = true;
  const stopWatching = (reason: string) => {
    if (!watching) return;
    watching = false;
    watcher.close();
    log.warn(
      `ほかの場所での変更を見張れなくなりました（${reason}）。画面は再読み込みするまで自動では更新されません`,
    );
    broadcast("watch-error", { reason });
  };
  let watcher: FSWatcher;
  try {
    watcher = watch(directory, (_event, name) => {
      if (name !== basename(options.file)) {
        if (!existsSync(directory)) stopWatching(`${directory} が無くなりました`);
        return;
      }
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        currentRevision(options.file).then(
          (revision) => {
            if (revision === knownRevision) return;
            knownRevision = revision;
            log.warn(`${session.file} がほかの場所で変更されました`);
            broadcast("change", { revision, writer: null });
          },
          (error: unknown) => log.warn(`${session.file} を読めません: ${describeError(error)}`),
        );
      }, WATCH_DEBOUNCE_MS);
    });
  } catch (error) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw error;
  }
  watcher.on("error", (error) => stopWatching(describeError(error)));

  const heartbeat = setInterval(() => {
    for (const listener of listeners) listener.write(": ping\n\n");
  }, HEARTBEAT_MS);

  return {
    url: `http://${host}:${port}/?token=${encodeURIComponent(token)}`,
    port,
    close: async () => {
      clearTimeout(debounce);
      clearInterval(heartbeat);
      watching = false;
      watcher.close();
      for (const listener of listeners) listener.end();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** ファイルが無ければ null。読めない理由がほかにあれば、上書きしてしまわないよう投げる */
async function currentRevision(file: string): Promise<Revision | null> {
  try {
    return revisionOf(await readFile(file, "utf8"));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export function describeError(error: unknown) {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? `${error.code}: ` : "";
    return `${code}${error.message}`;
  }
  return String(error);
}

export function isAllowedHost(host: string | undefined, port: number) {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

function sameToken(given: string | null | undefined, expected: string) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** セッションを meta タグとして埋め込む。エディタはこれを見てファイルへ保存する */
export function injectSession(html: string, session: Session) {
  const content = JSON.stringify(session)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return html.replace(
    "<head>",
    `<head>\n    <meta name="${SESSION_META_NAME}" content="${content}" />`,
  );
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("リクエストが大きすぎます");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function sendText(response: ServerResponse, status: number, body: string) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(body);
}
