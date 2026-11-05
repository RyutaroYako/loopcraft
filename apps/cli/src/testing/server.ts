import { request } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentStateSchema } from "@loopcraft/core/agent";
import type { AgentState } from "@loopcraft/core/agent";
import { TOKEN_HEADER } from "@loopcraft/core/session";
import * as v from "valibot";
import { startServer } from "../server/server.ts";
import type { RunningServer, ServerOptions } from "../server/server.ts";
import { createWebDir, createWorkspace, writeSample } from "./fixtures.ts";

export const TOKEN = "test-token";

/** pack した dist でなくソースを動かすのは、テストのたびに pack し直さずに済むようにするため */
export const LOOPCRAFT_COMMAND = [
  process.execPath,
  fileURLToPath(new URL("../cli.ts", import.meta.url)),
];

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
  options: {
    readonly?: boolean;
    existing?: boolean;
    sample?: boolean;
    agent?: string;
    name?: string;
  } = {},
) {
  const workspace = await createWorkspace();
  const name = options.name ?? "diagram.json";
  const file = join(workspace.cwd, name);
  if (options.existing !== false) await writeSample(workspace.cwd, name);
  const server = await startTracked({
    file,
    readonly: options.readonly ?? false,
    sample: options.sample,
    log: workspace.logger,
    token: TOKEN,
    ...(options.agent
      ? {
          agent: {
            command: options.agent,
            cwd: workspace.cwd,
            cli: LOOPCRAFT_COMMAND,
            info: { label: "Claude Code", version: "9.9.9" },
          },
        }
      : {}),
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

export async function openEvents(server: RunningServer, path = "/api/events") {
  const controller = new AbortController();
  const response = await fetch(`http://127.0.0.1:${server.port}${path}?token=${TOKEN}`, {
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

/** AI の会話の状態を受け取り、条件を満たすまで待つ */
export async function openAgentEvents(server: RunningServer) {
  const events = await openEvents(server, "/api/agent/events");
  let latest: AgentState | undefined;
  return {
    async until(predicate: (state: AgentState) => boolean) {
      while (!latest || !predicate(latest)) {
        const chunk = await events.next("event: state");
        latest = v.parse(AgentStateSchema, JSON.parse(chunk.slice(chunk.indexOf("data: ") + 6)));
      }
      return latest;
    },
    close: events.close,
  };
}
