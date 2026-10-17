export type Failure = { kind: "usage" | "failure"; message: string };

export type Outcome = { kind: "done" } | { kind: "cancelled" } | Failure;

export const done: Outcome = { kind: "done" };

export function usageError(message: string): Failure {
  return { kind: "usage", message };
}

export function failure(message: string): Failure {
  return { kind: "failure", message };
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
