/** メニューや確認を出してよいか。CI やパイプにつながっているときは出さない */
export function isInteractive(env: NodeJS.ProcessEnv = process.env) {
  return process.stderr.isTTY && !env["CI"];
}

/**
 * 入力を求めてよいか。stderr が端末でも stdin がパイプなら答えられないので、
 * 聞かずに必要なフラグを示して終える
 */
export function canPrompt(env: NodeJS.ProcessEnv = process.env) {
  return isInteractive(env) && process.stdin.isTTY;
}
