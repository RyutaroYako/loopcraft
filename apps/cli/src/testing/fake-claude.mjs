// テストで PATH に置く claude の代わり。FAKE_CLAUDE_DIR/scenario.json の筋書きどおりに stream-json を流す
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.FAKE_CLAUDE_DIR;
const args = process.argv.slice(2);

if (args.includes("--version")) {
  process.stdout.write("9.9.9 (Claude Code)\n");
  process.exit(0);
}

let stdin = "";
for await (const chunk of process.stdin) stdin += chunk;

const callsFile = join(dir, "calls.jsonl");
const previous = existsSync(callsFile)
  ? readFileSync(callsFile, "utf8").split("\n").filter(Boolean).length
  : 0;
appendFileSync(callsFile, `${JSON.stringify({ args, stdin, cwd: process.cwd() })}\n`);

const runs = JSON.parse(readFileSync(join(dir, "scenario.json"), "utf8"));
const run = runs[Math.min(previous, runs.length - 1)];
const session = run.session ?? "sess-1";
const print = (line) => process.stdout.write(`${JSON.stringify(line)}\n`);

let id = 0;
const useTool = (name, input) => {
  const toolId = `tool-${++id}`;
  print({
    type: "assistant",
    message: { content: [{ type: "tool_use", id: toolId, name, input }] },
  });
  return toolId;
};
const toolResult = (toolId, content, isError = false) =>
  print({
    type: "user",
    message: {
      content: [{ type: "tool_result", tool_use_id: toolId, content, is_error: isError }],
    },
  });

if (run.stderr) process.stderr.write(run.stderr);
if (run.exit !== undefined && !run.steps) process.exit(run.exit);

print({ type: "system", subtype: "init", session_id: session });
for (const step of run.steps ?? []) {
  if (step.text) {
    print({ type: "assistant", message: { content: [{ type: "text", text: step.text }] } });
  } else if (step.read) {
    const toolId = useTool("Read", { file_path: join(process.cwd(), step.read) });
    toolResult(toolId, readFileSync(join(process.cwd(), step.read), "utf8"));
  } else if (step.bash) {
    // 許可の規則は確かめない。規則どおりに claude を動かすかは、渡した引数で確かめる
    const toolId = useTool("Bash", { command: step.bash });
    const ran = spawnSync("bash", ["-c", step.bash], { encoding: "utf8", env: process.env });
    appendFileSync(
      join(dir, "replies.jsonl"),
      `${JSON.stringify({ code: ran.status, stdout: ran.stdout, stderr: ran.stderr })}\n`,
    );
    toolResult(toolId, `${ran.stdout}${ran.stderr}`, ran.status !== 0);
  } else if (step.hang) {
    await new Promise(() => setInterval(() => {}, 1000));
  }
}
if (run.result !== undefined) {
  print({
    type: "result",
    is_error: run.result.error ?? false,
    result: run.result.text,
    session_id: session,
  });
}
process.exit(run.exit ?? 0);
