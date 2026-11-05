import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isRunning } from "@loopcraft/core/agent";
import type { AgentState } from "@loopcraft/core/agent";
import { parseDiagramJson } from "@loopcraft/core/io";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test";
import { revisionOf } from "../files.ts";
import { installFakeClaude } from "../testing/fake-claude.ts";
import type { FakeRun } from "../testing/fake-claude.ts";
import {
  api,
  closeServers,
  openAgentEvents,
  openEvents,
  send,
  start,
  TOKEN,
} from "../testing/server.ts";

let fake: ReturnType<typeof installFakeClaude>;
const closers: (() => void)[] = [];

beforeAll(() => {
  fake = installFakeClaude();
});
afterAll(() => fake.restore());
afterEach(async () => {
  for (const close of closers.splice(0)) close();
  await closeServers();
});

const edit = (...operations: unknown[]) => ({
  bash: `loopcraft edit diagram.json - <<< '${operations.map((op) => JSON.stringify(op)).join("\n")}'`,
});

const addQuitMeeting: FakeRun = {
  steps: [
    { text: "面談の回数を足します。" },
    { read: "diagram.json" },
    edit(
      { op: "add-variable", id: "meetings", label: "面談の回数" },
      { op: "add-link", from: "attrition", to: "meetings", polarity: "+" },
      { op: "add-link", from: "meetings", to: "attrition", polarity: "-" },
    ),
    { bash: "loopcraft check diagram.json --format json" },
    { text: "離職を抑えるバランスループを足しました。" },
  ],
  result: { text: "離職を抑えるバランスループを足しました。" },
};

async function startAgent(options: { readonly?: boolean; name?: string } = {}) {
  const started = await start({ agent: fake.command, ...options });
  const events = await openAgentEvents(started.server);
  closers.push(events.close);
  const prompt = (body: unknown) =>
    api(started.server, "/api/agent/prompt", { method: "POST", body: JSON.stringify(body) });
  const post = (action: string, body: unknown = {}) =>
    api(started.server, `/api/agent/${action}`, { method: "POST", body: JSON.stringify(body) });
  const finished = () => events.until((state) => state.turns.length > 0 && !isRunning(state));
  const diagram = async () => {
    const parsed = parseDiagramJson(await readFile(started.file, "utf8"));
    if (!parsed.ok) throw new Error("図を読めません");
    return parsed.diagram;
  };
  return { ...started, events, prompt, post, finished, diagram };
}

const lastTurn = (state: AgentState) => state.turns.at(-1)!;

describe("AI に図を変えさせる", () => {
  it("使える AI をセッションで伝え、読み取り専用なら伝えない", async () => {
    const { server } = await start({ agent: fake.command });
    expect((await send(server, `/?token=${TOKEN}`)).body).toContain(
      "&quot;agent&quot;:{&quot;label&quot;:&quot;Claude Code&quot;,&quot;version&quot;:&quot;9.9.9&quot;}",
    );
    const readonly = await start({ agent: fake.command, readonly: true });
    expect((await send(readonly.server, `/?token=${TOKEN}`)).body).not.toContain("agent");
    expect((await api(readonly.server, "/api/agent/prompt", { method: "POST" })).status).toBe(404);
  });

  it("読むだけの道具と、図に対する loopcraft のコマンドだけを許して claude を動かし、選んでいる要素を添える", async () => {
    fake.script(addQuitMeeting);
    const agent = await startAgent();
    const response = await agent.prompt({
      prompt: "離職数を減らす打ち手を足して",
      selection: { kind: "variable", id: "attrition", label: "離職数" },
    });
    expect(response.status).toBe(202);
    await agent.finished();
    const [call] = fake.calls();
    expect(call!.args).toEqual(
      expect.arrayContaining(["-p", "--output-format", "stream-json", "--strict-mcp-config"]),
    );
    const after = (flag: string) => call!.args[call!.args.indexOf(flag) + 1];
    const listed = (flag: string, count: number) =>
      call!.args.slice(call!.args.indexOf(flag) + 1, call!.args.indexOf(flag) + 1 + count);
    expect(after("--permission-mode")).toBe("dontAsk");
    expect(after("--setting-sources")).toBe("");
    expect(listed("--tools", 4)).toEqual(["Bash", "Read", "Grep", "Glob"]);
    expect(listed("--allowedTools", 6)).toEqual([
      "Bash(loopcraft edit diagram.json:*)",
      "Bash(loopcraft layout diagram.json:*)",
      "Bash(loopcraft check diagram.json:*)",
      "Read",
      "Grep",
      "Glob",
    ]);
    expect(call!.args).not.toContain("--resume");
    expect(call!.args).not.toContain("--mcp-config");
    expect(call!.stdin).toBe(
      "（画面で選んでいる変数: 離職数、ID: attrition）\n\n離職数を減らす打ち手を足して",
    );
    expect(call!.cwd).toBe(agent.cwd);
  });

  it("ファイル名に空白があれば、引用符で囲んだ名前で許し、そのとおりに打たせる", async () => {
    fake.script({
      steps: [{ bash: `loopcraft edit 'my map.json' - <<< '{"op":"set-title","title":"x"}'` }],
      result: { text: "変えました" },
    });
    const agent = await startAgent({ name: "my map.json" });
    await agent.prompt({ prompt: "題名を変えて" });
    const state = await agent.finished();
    const [call] = fake.calls();
    expect(call!.args).toContain("Bash(loopcraft edit 'my map.json':*)");
    expect(call!.args[call!.args.indexOf("--system-prompt") + 1]).toContain(
      "loopcraft edit 'my map.json' - <<< '操作'",
    );
    expect(lastTurn(state).undoable).toBe(true);
    expect(lastTurn(state).items).toEqual([
      { kind: "changes", changes: [{ kind: "title-changed", title: "x" }] },
    ]);
  });

  it("serve と同じ loopcraft で図を変えさせ、変えた内容と確かめた結果を、画面へ順に伝える", async () => {
    fake.script(addQuitMeeting);
    const agent = await startAgent();
    const changes = await openEvents(agent.server);
    closers.push(changes.close);
    await agent.prompt({ prompt: "離職数を減らす打ち手を足して" });
    const state = await agent.finished();

    expect((await agent.diagram()).variables.map((variable) => variable.label)).toContain(
      "面談の回数",
    );
    expect(await changes.next('"writer":"agent"')).toBeTruthy();
    const turn = lastTurn(state);
    expect(turn).toMatchObject({
      prompt: "離職数を減らす打ち手を足して",
      status: "done",
      undoable: true,
      touched: { variables: ["meetings"], links: ["attrition_meetings", "meetings_attrition"] },
    });
    expect(turn.activity).toBeUndefined();
    expect(turn.items).toEqual([
      { kind: "text", text: "面談の回数を足します。" },
      {
        kind: "changes",
        changes: [
          { kind: "variable-added", label: "面談の回数" },
          { kind: "link-added", from: "離職数", to: "面談の回数", polarity: "+" },
          { kind: "link-added", from: "面談の回数", to: "離職数", polarity: "-" },
        ],
      },
      { kind: "checked", loops: { R: expect.any(Number), B: expect.any(Number) }, errors: 0 },
      { kind: "text", text: "離職を抑えるバランスループを足しました。" },
    ]);
  });

  it("失敗した操作では何も変わらず、読んだほかのファイルを伝える", async () => {
    fake.script({
      steps: [
        { read: "notes.md" },
        edit({ op: "add-link", from: "attrition", to: "missing", polarity: "+" }),
      ],
      result: { text: "できませんでした" },
    });
    const agent = await startAgent();
    await writeFile(join(agent.cwd, "notes.md"), "離職の理由");
    const before = await readFile(agent.file, "utf8");
    await agent.prompt({ prompt: "つないで" });
    const state = await agent.finished();
    expect(await readFile(agent.file, "utf8")).toBe(before);
    expect(fake.replies()[0]).toMatchObject({ code: 1 });
    expect(lastTurn(state)).toMatchObject({
      status: "done",
      undoable: false,
      items: [{ kind: "read", path: "notes.md" }],
    });
  });

  it("止めても、それまでに変えた所は一覧に出し、取り消せる", async () => {
    fake.script({
      steps: [edit({ op: "set-title", title: "途中まで" }), { hang: true }],
    });
    const agent = await startAgent();
    await agent.prompt({ prompt: "変えて" });
    await agent.events.until((state) => (state.turns.at(-1)?.items.length ?? 0) > 0);
    await agent.post("stop");
    expect(lastTurn(await agent.finished())).toMatchObject({
      status: "stopped",
      undoable: true,
      items: [{ kind: "changes", changes: [{ kind: "title-changed", title: "途中まで" }] }],
    });
  });

  it("次の指示は同じ会話を続け、会話が消えていたら新しく始める", async () => {
    fake.script({ session: "sess-1", result: { text: "はい" } });
    const agent = await startAgent();
    await agent.prompt({ prompt: "1 つめ" });
    await agent.finished();
    fake.script(
      { exit: 1, stderr: "No conversation found with session ID: sess-1" },
      { session: "sess-2", result: { text: "はい" } },
    );
    await agent.prompt({ prompt: "2 つめ" });
    const state = await agent.events.until(
      (current) => current.turns.length === 2 && !isRunning(current),
    );
    const [resumed, fresh] = fake.calls();
    expect(resumed!.args[resumed!.args.indexOf("--resume") + 1]).toBe("sess-1");
    expect(fresh!.args).not.toContain("--resume");
    expect(lastTurn(state).status).toBe("done");
  });

  it("AI の失敗と、異常な終わり方を伝える", async () => {
    fake.script({ result: { error: true, text: "API Error: Overloaded" } });
    const agent = await startAgent();
    await agent.prompt({ prompt: "変えて" });
    expect(lastTurn(await agent.finished())).toMatchObject({
      status: "failed",
      error: "API Error: Overloaded",
    });
    fake.script({ exit: 2, stderr: "warning\nInvalid API key · Please run /login" });
    await agent.prompt({ prompt: "もう一度" });
    const state = await agent.events.until(
      (current) => current.turns.length === 2 && !isRunning(current),
    );
    expect(lastTurn(state)).toMatchObject({
      status: "failed",
      error: "Invalid API key · Please run /login",
    });
  });

  it("動いている間は次の指示や新しい会話を断り、止めると停止したと伝える", async () => {
    fake.script({ steps: [{ text: "考えています" }, { hang: true }] });
    const agent = await startAgent();
    await agent.prompt({ prompt: "変えて" });
    await agent.events.until((state) => (state.turns.at(-1)?.items.length ?? 0) > 0);
    expect((await agent.prompt({ prompt: "割り込み" })).status).toBe(409);
    expect((await agent.post("reset")).status).toBe(409);
    await agent.post("stop");
    expect(lastTurn(await agent.finished())).toMatchObject({ status: "stopped" });
    expect((await agent.post("reset")).status).toBe(200);
    expect((await agent.events.until((state) => state.turns.length === 0)).turns).toEqual([]);
  });

  it("指示の変更を取り消すと、指示の前の図に戻し、その後に図が変わっていれば取り消せない", async () => {
    fake.script(addQuitMeeting);
    const agent = await startAgent();
    const original = await agent.diagram();
    await agent.prompt({ prompt: "足して" });
    const { id } = lastTurn(await agent.finished());
    expect((await agent.post("undo", { turn: id })).status).toBe(200);
    expect(await agent.diagram()).toEqual(original);
    expect(lastTurn(await agent.events.until((state) => lastTurn(state).undone))).toMatchObject({
      undoable: false,
    });

    await agent.prompt({ prompt: "もう一度" });
    const second = lastTurn(
      await agent.events.until((state) => state.turns.length === 2 && !isRunning(state)),
    );
    expect(second.undoable).toBe(true);
    await writeFile(join(agent.cwd, "diagram.json"), JSON.stringify(original));
    await agent.events.until((state) => !lastTurn(state).undoable);
    expect((await agent.post("undo", { turn: second.id })).status).toBe(409);
  });

  it("画面の保存と取り消しが重なっても、画面の変更を黙って上書きしない", async () => {
    fake.script(addQuitMeeting);
    const agent = await startAgent();
    await agent.prompt({ prompt: "足して" });
    const { id } = lastTurn(await agent.finished());
    const after = await agent.diagram();
    const edited = { ...after, title: "画面で直した" };
    const [saved, undone] = await Promise.all([
      api(agent.server, "/api/document", {
        method: "PUT",
        body: JSON.stringify({
          diagram: edited,
          baseRevision: revisionOf(await readFile(agent.file, "utf8")),
        }),
      }),
      agent.post("undo", { turn: id }),
    ]);
    expect([saved.status, undone.status]).not.toEqual([200, 200]);
    if (saved.status === 200) expect(await agent.diagram()).toEqual(edited);
  });
});
