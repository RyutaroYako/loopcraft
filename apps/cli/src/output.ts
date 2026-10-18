import type { Logger } from "./log.ts";
import { codeOf } from "./outcome.ts";
import type { Failure } from "./outcome.ts";

/**
 * 字下げしないのは、読み手にとって空白は意味が無く、トークンを増やすだけのため
 */
export function printData(log: Logger, data: unknown) {
  log.output(JSON.stringify({ ok: true, data }));
}

export function printFailure(log: Logger, outcome: Failure) {
  log.output(
    JSON.stringify({
      ok: false,
      error: {
        code: codeOf(outcome),
        message: outcome.message,
        suggestions: outcome.suggestions ?? [],
      },
      ...(outcome.data === undefined ? {} : { data: outcome.data }),
    }),
  );
}

/** commander が読んだオプションから決めないのは、読み終える前の誤りも JSON で返すため */
export function wantsJson(argv: readonly string[]) {
  return argv.some(
    (arg, at) => arg === "--format=json" || (arg === "--format" && argv[at + 1] === "json"),
  );
}
