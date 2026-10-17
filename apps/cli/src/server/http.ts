import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const MAX_BODY_BYTES = 10 * 1024 * 1024;

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

export function sameToken(given: string | null | undefined, expected: string) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function readBody(request: IncomingMessage) {
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

export function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

export function sendText(response: ServerResponse, status: number, body: string) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(body);
}
