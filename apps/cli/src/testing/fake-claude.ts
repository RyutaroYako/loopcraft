import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./fake-claude.mjs", import.meta.url));

export type FakeStep =
  | { text: string }
  | { read: string }
  /** Bash で打つ。PATH には serve が置いた loopcraft がある */
  | { bash: string }
  /** 止められるまで終わらない */
  | { hang: true };

export interface FakeRun {
  session?: string;
  steps?: FakeStep[];
  result?: { text?: string; error?: boolean };
  exit?: number;
  stderr?: string;
}

export interface FakeCall {
  args: string[];
  stdin: string;
  cwd: string;
}

/**
 * 本物の claude を動かさないのは、テストが手元のログインや通信に左右されるため。
 * 引数の組み立て・ストリームの読み取り・loopcraft の呼び出しは本物の道筋を通る
 */
export function installFakeClaude() {
  const dir = mkdtempSync(join(tmpdir(), "loopcraft-fake-claude-"));
  const command = join(dir, "claude");
  writeFileSync(command, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  chmodSync(command, 0o755);
  const previous = process.env["FAKE_CLAUDE_DIR"];
  process.env["FAKE_CLAUDE_DIR"] = dir;
  const lines = (name: string) => {
    try {
      return readFileSync(join(dir, name), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as unknown);
    } catch {
      return [];
    }
  };
  return {
    command,
    /** 呼ばれるたびに次の筋書きを使い、尽きたら最後を繰り返す */
    script(...runs: FakeRun[]) {
      writeFileSync(join(dir, "scenario.json"), JSON.stringify(runs));
      rmSync(join(dir, "calls.jsonl"), { force: true });
      rmSync(join(dir, "replies.jsonl"), { force: true });
    },
    calls: () => lines("calls.jsonl") as FakeCall[],
    replies: () => lines("replies.jsonl"),
    restore() {
      if (previous === undefined) delete process.env["FAKE_CLAUDE_DIR"];
      else process.env["FAKE_CLAUDE_DIR"] = previous;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
