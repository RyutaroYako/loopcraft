import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { SESSION_META_NAME } from "@loopcraft/core/session";
import type { Session } from "@loopcraft/core/session";
import { sameToken, sendText } from "./http.ts";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json; charset=utf-8",
};

export interface Site {
  webDir: string;
  token: string;
  session: Session;
}

export async function serveStatic(url: URL, response: ServerResponse, site: Site) {
  const { pathname } = url;
  let relativePath: string;
  try {
    relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  } catch {
    sendText(response, 400, "Bad Request");
    return;
  }
  const path = normalize(join(site.webDir, relativePath));
  if (path !== site.webDir && !path.startsWith(site.webDir + sep)) {
    sendText(response, 404, "Not Found");
    return;
  }
  const isIndex = path === join(site.webDir, "index.html");
  // トークン無しで画面を返さないのは、同じマシンのほかの利用者が埋め込まれたトークンを読み取って、
  // ファイルを書き換えられるため
  if (isIndex && !sameToken(url.searchParams.get("token"), site.token)) {
    sendText(
      response,
      403,
      "この URL では開けません。loopcraft serve を起動し直した場合は、ターミナルに表示された新しい URL を開いてください",
    );
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
    response.end(injectSession(content.toString("utf8"), site.session));
    return;
  }
  response.writeHead(200, { "content-type": type });
  response.end(content);
}

/** エディタはこの meta タグを読んで保存先を知る */
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
