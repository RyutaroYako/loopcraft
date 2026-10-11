import open from "open";
import { clackPrompts } from "./interactive.ts";
import { createLogger } from "./log.ts";
import { runCli } from "./program.ts";
import { canPrompt } from "./tty.ts";
import { readVersion } from "./version.ts";

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
});

process.exitCode = exitCode;
