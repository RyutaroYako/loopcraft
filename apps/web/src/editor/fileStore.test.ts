import { createSampleDiagram } from "@loopcraft/core/sample";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createFileClient } from "./fileStore.ts";

const session = { token: "tok", file: "a.json", editable: true, readonly: false };

function respond(status: number, body: unknown) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

afterEach(() => vi.unstubAllGlobals());

describe("createFileClient", () => {
  it("読み込み、版を覚えて保存の前提にする", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        respond(200, { status: "ok", diagram: createSampleDiagram(), revision: "r1" }),
      )
      .mockResolvedValueOnce(respond(200, { status: "saved", revision: "r2" }))
      .mockResolvedValueOnce(respond(200, { status: "saved", revision: "r3" }));
    vi.stubGlobal("fetch", fetch);
    const { load, store } = createFileClient(session);
    expect(store.kind).toBe("file");
    expect(store.label).toBe("a.json");
    expect(await load()).toMatchObject({ status: "ok", revision: "r1" });
    expect(fetch.mock.calls[0]![1]).toEqual({ headers: { "x-loopcraft-token": "tok" } });
    expect(await store.save(createSampleDiagram(), { keepalive: true })).toEqual({ ok: true });
    expect(JSON.parse(fetch.mock.calls[1]![1].body as string)).toMatchObject({
      baseRevision: "r1",
    });
    expect(fetch.mock.calls[1]![1].keepalive).toBe(true);
    await store.save(createSampleDiagram(), { force: true });
    expect(JSON.parse(fetch.mock.calls[2]![1].body as string)).toMatchObject({
      baseRevision: "r2",
      force: true,
    });
  });

  it("ファイルが無ければ、作る前提で保存する", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(200, { status: "missing" }))
      .mockResolvedValueOnce(respond(200, { status: "saved", revision: "r1" }));
    vi.stubGlobal("fetch", fetch);
    const { load, store } = createFileClient(session);
    expect(await load()).toEqual({ status: "missing" });
    await store.save(createSampleDiagram());
    expect(JSON.parse(fetch.mock.calls[1]![1].body as string)).toMatchObject({
      baseRevision: null,
    });
  });

  it("届かない・読めない応答はエラーにする", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(respond(500, "boom"))
        .mockResolvedValueOnce(respond(200, { nope: 1 })),
    );
    const { load } = createFileClient(session);
    expect(await load()).toMatchObject({ status: "error" });
    expect(await load()).toMatchObject({ status: "error" });
  });

  it("競合と失敗を見分ける", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(respond(409, { status: "conflict", revision: "x" }))
        .mockResolvedValueOnce(respond(500, "disk full"))
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockRejectedValueOnce(new TypeError("offline")),
    );
    const { store } = createFileClient(session);
    expect(await store.save(createSampleDiagram())).toEqual({ ok: false, reason: "conflict" });
    const failed = await store.save(createSampleDiagram());
    expect(failed.ok === false && failed.reason === "failed" && String(failed.error)).toContain(
      "HTTP 500: disk full",
    );
    const forbidden = await store.save(createSampleDiagram());
    expect(
      forbidden.ok === false && forbidden.reason === "failed" && String(forbidden.error),
    ).toContain("HTTP 403");
    expect(await store.save(createSampleDiagram())).toMatchObject({ ok: false, reason: "failed" });
  });

  it("読み直して最新の図を返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          respond(200, { status: "ok", diagram: createSampleDiagram(), revision: "r" }),
        )
        .mockResolvedValueOnce(respond(200, { status: "invalid", revision: "r", errors: [] })),
    );
    const { store } = createFileClient(session);
    expect(await store.reload()).toMatchObject({ title: "組織の成長と人の負荷" });
    expect(await store.reload()).toBeUndefined();
  });

  it("自分の保存ではない変更だけを知らせる", async () => {
    const sources: FakeEventSource[] = [];
    class FakeEventSource extends EventTarget {
      closed = false;
      readonly url: string;
      constructor(url: string) {
        super();
        this.url = url;
        sources.push(this);
      }
      close() {
        this.closed = true;
      }
    }
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          respond(200, { status: "ok", diagram: createSampleDiagram(), revision: "r1" }),
        ),
    );
    const { load, store } = createFileClient(session);
    await load();
    const onChange = vi.fn();
    const stop = store.watch(onChange);
    const source = sources[0]!;
    expect(source.url).toBe("/api/events?token=tok");
    const emit = (data: string) => source.dispatchEvent(new MessageEvent("change", { data }));
    emit(JSON.stringify({ revision: "r1" }));
    emit("{");
    emit(JSON.stringify({ nope: true }));
    emit(JSON.stringify({ revision: "r2" }));
    expect(onChange).toHaveBeenCalledOnce();
    stop();
    expect(source.closed).toBe(true);
  });
});
