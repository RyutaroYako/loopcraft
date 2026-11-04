import type { AgentState, Turn } from "@loopcraft/core/agent";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Notice } from "../notice/useNotices.ts";
import { agentTurn, fakeAgentClient } from "../testing/agent.ts";
import { createAgentSession } from "./agentSession.ts";
import type { AgentView } from "./agentSession.ts";

afterEach(() => vi.useRealTimers());

function setup(prepared = true) {
  const { client, control } = fakeAgentClient();
  const views: AgentView[] = [];
  const notices: Notice[] = [];
  const session = createAgentSession(client, {
    prepare: async () => prepared,
    onView: (view) => views.push(view),
    notify: (notice) => notices.push(notice),
  });
  session.start();
  return { session, control, views, notices };
}

const state = (...turns: Turn[]): AgentState => ({ turns });

describe("createAgentSession", () => {
  it("送った指示が始まったと知らされるまで、読み取り専用のままにする", async () => {
    const { session, control } = setup();
    expect(await session.send("足して", undefined)).toBe(true);
    expect(control.prompts).toEqual([{ prompt: "足して" }]);
    expect(session.locked()).toBe(true);
    control.push(agentTurn());
    expect(session.locked()).toBe(true);
    control.push(agentTurn({ status: "done" }));
    expect(session.locked()).toBe(false);
    expect(session.view().state).toEqual(state(agentTurn({ status: "done" })));
  });

  it("始まりの知らせが届かなければ、しばらくして読み取り専用を解く", async () => {
    vi.useFakeTimers();
    const { session } = setup();
    await session.send("足して", undefined);
    expect(session.locked()).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(session.locked()).toBe(false);
  });

  it("動いている間は送らない", async () => {
    const { session, control } = setup();
    control.push(agentTurn());
    expect(await session.send("割り込み", undefined)).toBe(false);
    expect(control.prompts).toEqual([]);
  });

  it("図を保存できなければ送らず、送れなければ理由を伝えて読み取り専用を解く", async () => {
    const unsaved = setup(false);
    expect(await unsaved.session.send("足して", undefined)).toBe(false);
    expect(unsaved.control.prompts).toEqual([]);
    expect(unsaved.notices[0]?.title).toBe("図を保存できないため、AI に頼めません");

    const { session, control, notices } = setup();
    control.result = { ok: false, reason: "rejected" };
    expect(await session.send("足して", undefined)).toBe(false);
    expect(notices[0]?.title).toBe("AI がほかの指示を進めています");
    control.result = { ok: false, reason: "failed", error: new Error("HTTP 500") };
    await session.send("足して", undefined);
    expect(notices[1]).toEqual({
      tone: "error",
      title: "AI に指示を送れませんでした",
      details: ["HTTP 500"],
    });
    expect(session.locked()).toBe(false);
  });

  it("始まりの知らせが受け付けの応答より先に届いても、後で読み取り専用に戻さない", async () => {
    const { client, control } = fakeAgentClient();
    client.prompt = async () => {
      control.push(agentTurn({ status: "failed", error: "claude が見つかりません" }));
      return { ok: true };
    };
    const session = createAgentSession(client, {
      prepare: async () => true,
      onView: () => {},
      notify: () => {},
    });
    session.start();
    expect(await session.send("足して", undefined)).toBe(true);
    expect(session.locked()).toBe(false);
    control.push();
    expect(session.locked()).toBe(false);
  });

  it("図を保存できなければ取り消さない", async () => {
    const { session, control, notices } = setup(false);
    await session.undo("turn-1");
    expect(control.undone).toEqual([]);
    expect(notices[0]?.title).toBe("図を保存できないため、取り消せません");
  });

  it("取り消せなくなっていたら伝える", async () => {
    const { session, control, notices } = setup();
    control.result = { ok: false, reason: "rejected" };
    await session.undo("turn-1");
    expect(control.undone).toEqual(["turn-1"]);
    expect(notices[0]?.title).toBe("その後に図が変わったため、取り消せません");
  });

  it("止める・新しい会話・取り消しを送れなければ伝え、受け付けなかっただけなら伝えない", async () => {
    const { session, control, notices } = setup();
    control.result = { ok: false, reason: "rejected" };
    await session.stop();
    await session.reset();
    expect(notices).toEqual([]);
    control.result = { ok: false, reason: "failed", error: new Error("HTTP 500") };
    await session.stop();
    await session.reset();
    await session.undo("turn-1");
    expect(notices).toEqual(
      [
        "AI を止められませんでした",
        "新しい会話を始められませんでした",
        "指示の変更を取り消せませんでした",
      ].map((title) => ({ tone: "error", title, details: ["HTTP 500"] })),
    );
    control.result = { ok: true };
    await session.undo("turn-1");
    expect(notices).toHaveLength(3);
  });
});
