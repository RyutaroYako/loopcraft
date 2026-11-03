// テストで PATH に置く claude の代わり。FAKE_CLAUDE_DIR/scenario.json の筋書きどおりに stream-json を流す
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
const config = JSON.parse(args[args.indexOf("--mcp-config") + 1]);
const server = Object.values(config.mcpServers)[0];
const session = run.session ?? "sess-1";
const print = (line) => process.stdout.write(`${JSON.stringify(line)}\n`);

let id = 0;
const callTool = async (name, input) => {
  const response = await fetch(server.url, {
    method: "POST",
    headers: { ...server.headers, "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++id,
      method: "tools/call",
      params: { name, arguments: input },
    }),
  });
  return response.json();
};

if (run.stderr) process.stderr.write(run.stderr);
if (run.exit !== undefined && !run.steps) process.exit(run.exit);

print({ type: "system", subtype: "init", session_id: session });
for (const step of run.steps ?? []) {
  if (step.text) {
    print({ type: "assistant", message: { content: [{ type: "text", text: step.text }] } });
  } else if (step.read) {
    print({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", name: "Read", input: { file_path: join(process.cwd(), step.read) } },
        ],
      },
    });
  } else if (step.tool) {
    print({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", name: `mcp__loopcraft__${step.tool}`, input: step.input ?? {} },
        ],
      },
    });
    const reply = await callTool(step.tool, step.input ?? {});
    appendFileSync(join(dir, "replies.jsonl"), `${JSON.stringify(reply)}\n`);
    print({
      type: "user",
      message: { content: [{ type: "tool_result", content: reply.result?.content ?? [] }] },
    });
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
