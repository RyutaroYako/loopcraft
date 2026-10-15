export function isInteractive(env: NodeJS.ProcessEnv = process.env) {
  return process.stderr.isTTY && !env["CI"];
}

/** stderr だけで判断しないのは、stdin がパイプだと答えられないため */
export function canPrompt(env: NodeJS.ProcessEnv = process.env) {
  return isInteractive(env) && process.stdin.isTTY;
}
