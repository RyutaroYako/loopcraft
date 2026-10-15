export class UsageError extends Error {
  readonly exitCode = 2;
}

export class FailureError extends Error {
  readonly exitCode = 1;
}

export function exitCodeOf(error: unknown) {
  return error instanceof UsageError || error instanceof FailureError ? error.exitCode : 1;
}
