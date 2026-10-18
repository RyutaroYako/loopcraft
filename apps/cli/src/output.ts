import type { Logger } from "./log.ts";
import { codeOf } from "./outcome.ts";
import type { Failure } from "./outcome.ts";

/**
 * 字下げしないのは、読み手にとって空白は意味が無く、トークンを増やすだけのため。
 * 成功も失敗も同じ形にして、読み手が ok を見るだけで分岐できるようにする
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

/** commander が読み終える前の誤りでも JSON で返せるよう、引数から直接読む */
export function wantsJson(argv: readonly string[]) {
  return argv.some(
    (arg, at) => arg === "--format=json" || (arg === "--format" && argv[at + 1] === "json"),
  );
}
