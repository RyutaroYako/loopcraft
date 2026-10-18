import open from "open";
import { clackPrompts } from "./interactive.ts";
import { createLogger } from "./log.ts";
import { runCli } from "./program.ts";
import { canPrompt } from "./tty.ts";
import { readVersion } from "./version.ts";

// head などで途中まで読んで閉じられたときに、壊れたように見えるスタックトレースを出さない
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(process.exitCode ?? 0);
  throw error;
});

const exitCode = await runCli(process.argv, {
  context: { log: createLogger(), cwd: process.cwd() },
  version: readVersion(),
  canPrompt: () => canPrompt(),
  prompts: clackPrompts,
  openBrowser: (url) => open(url),
  waitForExit: () =>
    new Promise<void>((resolve) => {
      process.once("SIGINT", () => resolve());
      process.once("SIGTERM", () => resolve());
    }),
  readStdin: () => (process.stdin.isTTY ? undefined : readAll(process.stdin)),
});

process.exitCode = exitCode;

async function readAll(stream: NodeJS.ReadableStream) {
  let text = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) text += chunk;
  return text;
}
