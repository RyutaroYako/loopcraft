/**
 * 同じタスクを claude -p で何度か解かせ、成功率・ターン数・コストを比べる。
 *
 *   node scripts/agent-dx/run.ts --tarball loopcraft-0.2.0.tgz --label baseline --runs 3
 *
 * 結果は --out（既定: tmp/agent-dx）の <label>/results.jsonl に追記する。記録は docs/agent-dx-log.md
 */
import { execFileSync, spawn } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { TASKS } from "./tasks.ts";
import type { Task } from "./tasks.ts";

const { values } = parseArgs({
  options: {
    tarball: { type: "string" },
    label: { type: "string" },
    runs: { type: "string", default: "3" },
    model: { type: "string", default: "sonnet" },
    task: { type: "string", multiple: true },
    "agent-init": { type: "boolean", default: false },
    parallel: { type: "string", default: "3" },
    out: { type: "string", default: "tmp/agent-dx" },
  },
});
if (!values.tarball || !values.label) {
  console.error("--tarball と --label を指定してください");
  process.exit(2);
}

const root = resolve(values.out, values.label);
const fixtures = new URL("./fixtures/", import.meta.url);
const tasks = TASKS.filter((task) => !values.task || values.task.includes(task.name));
const template = join(root, "template");
if (!existsSync(join(template, "node_modules"))) {
  mkdirSync(template, { recursive: true });
  execFileSync("npm", ["init", "-y"], { cwd: template, stdio: "ignore" });
  execFileSync("npm", ["install", "--no-audit", "--no-fund", resolve(values.tarball)], {
    cwd: template,
    stdio: "ignore",
  });
}

interface Run {
  task: Task;
  index: number;
}

const queue: Run[] = tasks.flatMap((task) =>
  Array.from({ length: Number(values.runs) }, (_, index) => ({ task, index })),
);
const workers = Array.from({ length: Number(values.parallel) }, async () => {
  for (let run = queue.shift(); run; run = queue.shift()) await execute(run);
});
await Promise.all(workers);
summarize();

async function execute({ task, index }: Run) {
  const work = join(root, `${task.name}-${index + 1}`);
  // 上書きでコピーしないのは、前の回の diagram.json が残り、何もしなくても合格になるため
  rmSync(work, { recursive: true, force: true });
  cpSync(template, work, { recursive: true });
  const before = task.fixture ? readFileSync(new URL(task.fixture, fixtures), "utf8") : undefined;
  if (before) writeFileSync(join(work, "diagram.json"), before);
  if (values["agent-init"]) {
    execFileSync("npx", ["loopcraft", "agent-init"], { cwd: work, stdio: "ignore" });
  }
  const transcript = await claude(task.prompt, work);
  writeFileSync(join(work, "transcript.jsonl"), transcript);
  const after = existsSync(join(work, "diagram.json"))
    ? readFileSync(join(work, "diagram.json"), "utf8")
    : undefined;
  const record = {
    task: task.name,
    run: index + 1,
    ...measure(transcript),
    ...task.score(after, before),
  };
  appendFileSync(join(root, "results.jsonl"), `${JSON.stringify(record)}\n`);
  console.error(
    `${task.name}#${index + 1}: ${record.passed ? "pass" : "fail"} ${JSON.stringify(record.checks)}`,
  );
}

function claude(prompt: string, cwd: string): Promise<string> {
  return new Promise((done) => {
    const child = spawn(
      "claude",
      [
        "-p",
        prompt,
        "--model",
        values.model!,
        "--output-format",
        "stream-json",
        "--verbose",
        // 手元の設定や MCP サーバーを読ませないのは、条件ごとの差が CLI の違いだけになるようにするため
        "--setting-sources",
        "project,local",
        "--strict-mcp-config",
        "--no-session-persistence",
        "--allowedTools",
        "Bash Read Write Edit Glob Grep",
        // serve はブラウザを開き、終わらずに待ち続けるため。プラグインのツールは --strict-mcp-config でも残る
        "--disallowedTools",
        "Bash(npx loopcraft serve:*) Bash(./node_modules/.bin/loopcraft serve:*) mcp__status-band__report_progress",
      ],
      { cwd, stdio: ["ignore", "pipe", "ignore"] },
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    const timer = setTimeout(() => child.kill("SIGTERM"), 10 * 60 * 1000);
    child.on("close", () => {
      clearTimeout(timer);
      done(output);
    });
  });
}

function measure(transcript: string) {
  const events = transcript
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, unknown>];
      } catch {
        return [];
      }
    });
  const commands: string[] = [];
  let scripts = 0;
  for (const event of events) {
    if (event["type"] !== "assistant") continue;
    const content = (event["message"] as { content?: unknown[] }).content ?? [];
    for (const block of content as {
      type: string;
      name?: string;
      input?: Record<string, string>;
    }[]) {
      if (block.type !== "tool_use") continue;
      if (block.name === "Bash") commands.push(block.input?.["command"] ?? "");
      if (block.name === "Write" && /\.(m?js|ts|py)$/.test(block.input?.["file_path"] ?? ""))
        scripts++;
    }
  }
  const result = events.find((event) => event["type"] === "result") ?? {};
  const usage = (result["usage"] ?? {}) as Record<string, number>;
  return {
    turns: (result["num_turns"] as number | undefined) ?? null,
    cost: (result["total_cost_usd"] as number | undefined) ?? null,
    seconds: Math.round(((result["duration_ms"] as number | undefined) ?? 0) / 1000),
    outputTokens: usage["output_tokens"] ?? null,
    bash: commands.length,
    // 単に loopcraft を含むかで数えないのは、作業ディレクトリのパスにも loopcraft が入るため
    loopcraft: commands.filter((command) => /(^|[\s;&|(])loopcraft\s/m.test(command)).length,
    help: commands.filter((command) => /--help|\s-h(\s|$)/.test(command)).length,
    scripts,
  };
}

function summarize() {
  const records = readFileSync(join(root, "results.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, number | boolean | string>);
  const mean = (rows: typeof records, key: string) =>
    (rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0) / rows.length).toFixed(2);
  console.log(
    `| ${values.label} | 成功 | ターン | コスト | 出力トークン | Bash | loopcraft | help | スクリプト |`,
  );
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const name of new Set(records.map((record) => String(record["task"])))) {
    const rows = records.filter((record) => record["task"] === name);
    const passed = rows.filter((row) => row["passed"]).length;
    console.log(
      `| ${name} | ${passed}/${rows.length} | ${mean(rows, "turns")} | $${mean(rows, "cost")} | ${mean(rows, "outputTokens")} | ${mean(rows, "bash")} | ${mean(rows, "loopcraft")} | ${mean(rows, "help")} | ${mean(rows, "scripts")} |`,
    );
  }
}
