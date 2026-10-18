export type Failure = {
  kind: "usage" | "failure";
  message: string;
  code?: string;
  /** そのまま打てるコマンドか、次に直す場所 */
  suggestions?: string[];
  /** 失敗しても返したい結果（検証のエラーの一覧など） */
  data?: unknown;
};

export type Outcome = { kind: "done" } | { kind: "cancelled" } | Failure;

export const done: Outcome = { kind: "done" };

export function usageError(
  message: string,
  details: Pick<Failure, "code" | "suggestions"> = {},
): Failure {
  return { kind: "usage", message, ...details };
}

export function failure(
  message: string,
  details: Pick<Failure, "code" | "suggestions" | "data"> = {},
): Failure {
  return { kind: "failure", message, ...details };
}

export function exitCodeOf(outcome: Outcome): number {
  switch (outcome.kind) {
    case "done":
    case "cancelled":
      return 0;
    case "usage":
      return 2;
    case "failure":
      return 1;
  }
}

export function codeOf(outcome: Failure) {
  return outcome.code ?? (outcome.kind === "usage" ? "INVALID_ARGUMENTS" : "FAILED");
}
