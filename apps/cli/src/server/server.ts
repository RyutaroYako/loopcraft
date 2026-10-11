import { randomBytes, timingSafeEqual } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { basename, dirname, extname, join, normalize, sep } from "node:path";
import {
  SESSION_META_NAME,
  SaveRequestSchema,
  TOKEN_HEADER,
  type DocumentResponse,
  type Revision,
  type SaveResponse,
  type Session,
} from "@loopcraft/core/session";
import * as v from "valibot";
import "@valibot/i18n/ja/schema";
import { readDiagramFile, revisionOf, writeDiagramFile } from "../files.ts";
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
  let knownRevision: Revision | null = await currentRevision(options.file);
  const listeners = new Set<ServerResponse>();
  let port = options.port;

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      log.error(`リクエストを処理できませんでした: ${String(error)}`);
      if (!response.headersSent) sendJson(response, 500, { error: "internal error" });
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
    await serveStatic(url.pathname, response);
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
      await saveDocument(request, response);
      return;
    }
    if (url.pathname === "/api/events" && request.method === "GET") {
      openEvents(response);
      return;
    }
    sendJson(response, 404, { error: "not found" });
  }

  async function documentResponse(): Promise<DocumentResponse> {
    const loaded = await readDiagramFile(options.file);
    knownRevision = loaded.status === "missing" ? null : loaded.revision;
    if (loaded.status === "ok") {
      return { status: "ok", diagram: loaded.diagram, revision: loaded.revision };
    }
    return loaded;
  }

  async function saveDocument(request: IncomingMessage, response: ServerResponse) {
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

  function broadcast(revision: Revision | null) {
    for (const listener of listeners) {
      listener.write(`event: change\ndata: ${JSON.stringify({ revision })}\n\n`);
    }
  }

  async function serveStatic(pathname: string, response: ServerResponse) {
    const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
    const path = normalize(join(options.webDir, relativePath));
    if (path !== options.webDir && !path.startsWith(options.webDir + sep)) {
      sendText(response, 404, "Not Found");
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
    if (basename(path) === "index.html") {
      response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
      response.end(injectSession(content.toString("utf8"), session));
      return;
    }
    response.writeHead(200, { "content-type": type });
    response.end(content);
  }

  // エディタ以外（git pull やほかのエディタ）がファイルを書き換えたら、開いている画面に知らせる。
  // 置き換え保存ではファイル自体が作り直されるので、ファイルではなくディレクトリを見る
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const watcher: FSWatcher = watch(dirname(options.file), (_event, name) => {
    if (name !== basename(options.file)) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      void currentRevision(options.file).then((revision) => {
        if (revision === knownRevision) return;
        knownRevision = revision;
        log.warn(`${session.file} がほかの場所で変更されました`);
        broadcast(revision);
      });
    }, WATCH_DEBOUNCE_MS);
  });

  const heartbeat = setInterval(() => {
    for (const listener of listeners) listener.write(": ping\n\n");
  }, HEARTBEAT_MS);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  port = (server.address() as AddressInfo).port;

  return {
    url: `http://${host}:${port}/`,
    port,
    close: async () => {
      clearTimeout(debounce);
      clearInterval(heartbeat);
      watcher.close();
      for (const listener of listeners) listener.end();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function currentRevision(file: string): Promise<Revision | null> {
  try {
    return revisionOf(await readFile(file, "utf8"));
  } catch {
    return null;
  }
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
