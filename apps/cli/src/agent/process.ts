import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface JsonLinesExit {
  code: number | null;
  stderr: string;
  /** 止められて終わった */
  aborted: boolean;
}

const STDERR_LIMIT = 4000;

/**
 * 行ごとに JSON を出す CLI を動かし、読めた行と、最後に終わり方を返す。JSON でない行（案内や警告）は飛ばす
 */
export async function* spawnJsonLines(
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; signal: AbortSignal; stdin: string },
): AsyncGenerator<{ line: unknown } | { exit: JsonLinesExit }> {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["pipe", "pipe", "pipe"],
    signal: options.signal,
  });
  // 指示を引数で渡さないのは、長い指示が引数の長さの上限を超えるため
  child.stdin.on("error", () => {});
  child.stdin.end(options.stdin);
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-STDERR_LIMIT);
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.name === "AbortError") resolve(null);
      else reject(error);
    });
    child.on("close", resolve);
  });
  // 後の await で受けるだけにしないのは、読み終わる前に拒否されると、捕まえていない拒否になるため
  exited.catch(() => {});

  for await (const text of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
    let line: unknown;
    try {
      line = JSON.parse(text);
    } catch {
      continue;
    }
    yield { line };
  }
  const code = await exited;
  yield { exit: { code, stderr: stderr.trim(), aborted: options.signal.aborted } };
}

/** `--version` の版。PATH に無いか、動かせなければ undefined */
export function readVersion(command: string, timeoutMs = 10_000): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn(command, ["--version"], {
      stdio: ["ignore", "pipe", "ignore"],
      signal: AbortSignal.timeout(timeoutMs),
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.on("error", () => resolve(undefined));
    child.on("close", (code) =>
      resolve(code === 0 ? (stdout.match(/\d+\.\d[\w.-]*/)?.[0] ?? "") : undefined),
    );
  });
}
