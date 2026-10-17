import {
  CLIENT_HEADER,
  ChangeEventSchema,
  DocumentResponseSchema,
  SaveResponseSchema,
  TOKEN_HEADER,
} from "@loopcraft/core/session";
import type { DocumentResponse, Revision, Session } from "@loopcraft/core/session";
import * as v from "valibot";
import type { DocumentStore, ReloadResult, SaveResult } from "./store.ts";

export type LoadResult =
  | DocumentResponse
  /** サーバーに届かなかった、または応答が読めなかった */
  | { status: "error"; error: unknown };

/** ブラウザは keepalive の本文を 64KiB までに制限している */
const KEEPALIVE_LIMIT_BYTES = 60_000;
/** ブラウザの再接続の間隔（1 秒）より十分長くしないと、一時的な切断まで切れたとみなす */
const RECONNECT_GRACE_MS = 10_000;
/** サーバーは 25 秒ごとに ping を送る */
const SILENCE_LIMIT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;

export function createFileClient(session: Session, base = "") {
  /** baseRevision と分けるのは、開けなかった内容の版も、外部での変更と見分けるために覚えるため */
  let seen: Revision | null = null;
  /** 開けなかった内容の版へ進めないのは、上書きを選ばないかぎり保存を競合として止めるため */
  let baseRevision: Revision | null = null;
  /** session.token で済ませないのは、同じファイルを開いたほかのタブとも共有しているため */
  const clientId = crypto.randomUUID();
  let inFlight = 0;
  const headers = { [TOKEN_HEADER]: session.token };

  async function load(): Promise<LoadResult> {
    try {
      const response = await fetch(`${base}/api/document`, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(await errorOf(response));
      const body = v.parse(DocumentResponseSchema, await response.json());
      seen = body.status === "missing" ? null : body.revision;
      if (body.status !== "invalid") baseRevision = seen;
      return body;
    } catch (error) {
      return { status: "error", error };
    }
  }

  const store: DocumentStore = {
    kind: "file",
    label: session.file,
    async save(diagram, options = {}): Promise<SaveResult> {
      const body = JSON.stringify({ diagram, baseRevision, force: options.force });
      inFlight++;
      try {
        const response = await fetch(`${base}/api/document`, {
          method: "PUT",
          headers: { ...headers, [CLIENT_HEADER]: clientId, "content-type": "application/json" },
          body,
          keepalive: options.keepalive && new Blob([body]).size < KEEPALIVE_LIMIT_BYTES,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        // 失敗として扱わないのは、サーバーを起動し直してトークンが変わると、このページからはもう保存できないため
        if (response.status === 403) return { ok: false, reason: "disconnected" };
        if (!response.ok && response.status !== 409) throw new Error(await errorOf(response));
        const result = v.parse(SaveResponseSchema, await response.json());
        if (result.status === "conflict") return { ok: false, reason: "conflict" };
        seen = baseRevision = result.revision;
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: "failed", error };
      } finally {
        inFlight--;
      }
    },
    watch(handlers) {
      const source = new EventSource(
        `${base}/api/events?token=${encodeURIComponent(session.token)}`,
      );
      let lost = false;
      let grace: ReturnType<typeof setTimeout> | undefined;
      let lastHeard = Date.now();
      const heard = () => {
        lastHeard = Date.now();
        clearTimeout(grace);
        grace = undefined;
        if (!lost) return;
        lost = false;
        handlers.restored();
      };
      // error だけで見分けないのは、止まったわけではないのに応答しないサーバー（Ctrl+Z で
      // 一時停止したなど）からは、つなぎ直しの知らせも来ないため
      let lastTick = Date.now();
      const watchdog = setInterval(() => {
        const now = Date.now();
        // スリープやタブの凍結から戻った直後は、ping も遅れて届くので待ち直す
        if (now - lastTick > SILENCE_LIMIT_MS / 2) lastHeard = now;
        lastTick = now;
        if (now - lastHeard > SILENCE_LIMIT_MS) disconnect();
      }, SILENCE_LIMIT_MS / 4);
      const disconnect = () => {
        clearTimeout(grace);
        grace = undefined;
        if (lost) return;
        lost = true;
        handlers.lost("disconnected");
      };
      const onRevision = (event: MessageEvent) => {
        heard();
        const result = v.safeParse(ChangeEventSchema, parseJson(event.data));
        if (!result.success) return;
        if (result.output.writer === clientId) {
          // 自分の保存の知らせでも版を覚えるのは、待ちきれずに諦めた保存をサーバーが後から書き込むことがあるため
          if (inFlight === 0) seen = baseRevision = result.output.revision;
          return;
        }
        if (result.output.revision !== seen) handlers.change();
      };
      source.addEventListener("change", onRevision);
      // change だけ聞くと、切れていた間の変更を取りこぼす。revision はつないだ（つなぎ直した）ときに届く
      source.addEventListener("revision", onRevision);
      source.addEventListener("ping", heard);
      source.addEventListener("watch-error", (event) => {
        heard();
        const data = parseJson(event.data);
        const reason =
          typeof data === "object" && data !== null && "reason" in data ? String(data.reason) : "";
        handlers.lost("unwatched", reason);
      });
      source.addEventListener("error", () => {
        // すぐ切れたとみなさないのは、一時的に切れたときはブラウザが自動でつなぎ直すため。
        // サーバーを止めてもつなぎ直しを繰り返すだけで知らせが無いので、待つのはしばらくにする。
        // トークンが変わったときは CLOSED になり、もう戻らない
        if (source.readyState === EventSource.CLOSED) disconnect();
        else grace ??= setTimeout(disconnect, RECONNECT_GRACE_MS);
      });
      source.addEventListener("open", heard);
      return () => {
        clearTimeout(grace);
        clearInterval(watchdog);
        source.close();
      };
    },
    async reload(): Promise<ReloadResult> {
      const result = await load();
      if (result.status === "ok") return { ok: true, diagram: result.diagram };
      if (result.status === "missing") return { ok: false, problems: ["ファイルが削除されました"] };
      if (result.status === "invalid") return { ok: false, problems: result.errors };
      return { ok: false, problems: [String(result.error)] };
    },
  };

  return { load, store };
}

function parseJson(data: unknown) {
  try {
    return typeof data === "string" ? (JSON.parse(data) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

async function errorOf(response: Response) {
  const text = await response.text().catch(() => "");
  return text ? `HTTP ${response.status}: ${text}` : `HTTP ${response.status}`;
}
