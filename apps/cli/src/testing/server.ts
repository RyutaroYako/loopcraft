import { request } from "node:http";
import { join } from "node:path";
import { TOKEN_HEADER } from "@loopcraft/core/session";
import { startServer } from "../server/server.ts";
import type { RunningServer, ServerOptions } from "../server/server.ts";
import { createWebDir, createWorkspace, writeSample } from "./fixtures.ts";

export const TOKEN = "test-token";

const running = new Set<RunningServer>();

export async function closeServers() {
  await Promise.all([...running].map((server) => server.close()));
  running.clear();
}

export async function startTracked(options: Omit<ServerOptions, "webDir" | "port">) {
  const server = await startServer({ ...options, webDir: await createWebDir(), port: 0 });
  running.add(server);
  return server;
}

export async function start(
  options: { readonly?: boolean; existing?: boolean; sample?: boolean } = {},
) {
  const workspace = await createWorkspace();
  const file = join(workspace.cwd, "diagram.json");
  if (options.existing !== false) await writeSample(workspace.cwd);
  const server = await startTracked({
    file,
    readonly: options.readonly ?? false,
    sample: options.sample,
    log: workspace.logger,
    token: TOKEN,
  });
  return { ...workspace, file, server };
}

/** fetch を使わないのは、Host ヘッダーを自由に付けられないため */
export function send(
  server: RunningServer,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; host?: string } = {},
) {
  return new Promise<{ status: number; body: string; headers: Record<string, unknown> }>(
    (resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port: server.port,
          path,
          method: init.method ?? "GET",
          headers: { host: init.host ?? `127.0.0.1:${server.port}`, ...init.headers },
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => (body += chunk));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
        },
      );
      req.on("error", reject);
      req.end(init.body);
    },
  );
}

export const api = (server: RunningServer, path: string, init: Parameters<typeof send>[2] = {}) =>
  send(server, path, { ...init, headers: { [TOKEN_HEADER]: TOKEN, ...init.headers } });

export async function openEvents(server: RunningServer) {
  const controller = new AbortController();
  const response = await fetch(`http://127.0.0.1:${server.port}/api/events?token=${TOKEN}`, {
    signal: controller.signal,
  });
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  return {
    async next(marker: string) {
      while (!buffer.includes(marker)) {
        const { value, done } = await reader.read();
        if (done) throw new Error("closed");
        buffer += value;
      }
      const index = buffer.indexOf(marker);
      const end = buffer.indexOf("\n\n", index);
      const chunk = buffer.slice(index, end);
      buffer = buffer.slice(end + 2);
      return chunk;
    },
    close: () => controller.abort(),
  };
}
