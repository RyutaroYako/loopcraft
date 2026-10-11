/** 使い方の誤り（引数の不足など）。終了コード 2 で終える */
export class UsageError extends Error {
  readonly exitCode = 2;
}

/** 実行はできたが失敗した（検証エラーなど）。終了コード 1 で終える */
export class FailureError extends Error {
  readonly exitCode = 1;
}

export function exitCodeOf(error: unknown) {
  return error instanceof UsageError || error instanceof FailureError ? error.exitCode : 1;
}
