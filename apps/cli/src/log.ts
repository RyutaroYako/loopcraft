/** メッセージを stdout に出さないのは、パイプで結果だけを受け取れるようにするため */
export interface Logger {
  info(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  note(message: string): void;
  plain(message: string): void;
  output(message: string): void;
  readonly color: boolean;
}

interface Stream {
  write(chunk: string): unknown;
  isTTY?: boolean;
}

const RESET = "\u001B[0m";
const BOLD = "\u001B[1m";
const DIM = "\u001B[2m";
const CODES = { red: "\u001B[31m", green: "\u001B[32m", yellow: "\u001B[33m", cyan: "\u001B[36m" };

export function createLogger(
  streams: { stdout: Stream; stderr: Stream } = process,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Logger {
  const color =
    !("NO_COLOR" in env) && (Boolean(env["FORCE_COLOR"]) || streams.stderr.isTTY === true);
  // 記号を描けない古い Windows の端末では ASCII に置き換える
  const unicode = platform !== "win32" || "WT_SESSION" in env || Boolean(env["TERM_PROGRAM"]);
  const symbol = (fancy: string, plain: string) => (unicode ? fancy : plain);
  const styled = (code: string, mark: string, message: string) =>
    color ? `${code}${BOLD}${mark}${RESET} ${message}` : `${mark} ${message}`;
  const err = (line: string) => streams.stderr.write(`${line}\n`);
  return {
    color,
    info: (message) => err(styled(CODES.cyan, symbol("ℹ", "i"), message)),
    success: (message) => err(styled(CODES.green, symbol("✓", "v"), message)),
    warn: (message) => err(styled(CODES.yellow, symbol("⚠", "!"), message)),
    error: (message) => err(styled(CODES.red, symbol("✗", "x"), message)),
    note: (message) => err(color ? `${DIM}${message}${RESET}` : message),
    plain: err,
    output: (message) => streams.stdout.write(`${message}\n`),
  };
}

export function createMemoryLogger() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const logger: Logger = {
    color: false,
    info: (message) => stderr.push(`ℹ ${message}`),
    success: (message) => stderr.push(`✓ ${message}`),
    warn: (message) => stderr.push(`⚠ ${message}`),
    error: (message) => stderr.push(`✗ ${message}`),
    note: (message) => stderr.push(message),
    plain: (message) => stderr.push(message),
    output: (message) => stdout.push(message),
  };
  return { logger, stdout, stderr };
}
