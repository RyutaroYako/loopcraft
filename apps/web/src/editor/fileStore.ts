import {
  CLIENT_HEADER,
  ChangeEventSchema,
  DocumentResponseSchema,
  SaveResponseSchema,
  TOKEN_HEADER,
  type DocumentResponse,
  type Revision,
  type Session,
} from "@loopcraft/core/session";
import * as v from "valibot";
import type { DocumentStore, ReloadResult, SaveResult } from "./store.ts";

export type LoadResult =
  | DocumentResponse
  /** サーバーに届かなかった、または応答が読めなかった */
  | { status: "error"; error: unknown };

/** ブラウザは keepalive の本文を 64KiB までに制限しているので、それより大きければ使わない */
const KEEPALIVE_LIMIT_BYTES = 60_000;
/** つなぎ直せないまま、これだけ経ったらつながりが切れたとみなす。再接続の間隔（1 秒）より十分長くする */
const RECONNECT_GRACE_MS = 10_000;
/** サーバーは 25 秒ごとに ping を送る。これだけ何も届かなければ、応答しなくなったとみなす */
const SILENCE_LIMIT_MS = 60_000;
/** 応答しないサーバーへの保存を待ち続けないよう、これだけ経ったら失敗にする */
const REQUEST_TIMEOUT_MS = 15_000;

/** `loopcraft serve` の API とやりとりして、開いたファイルを読み書きする */
export function createFileClient(session: Session, base = "") {
  /** 最後に読んだ・保存したファイルの版。外部での変更と自分の保存を見分ける */
  let revision: Revision | null = null;
  /** この画面の ID。同じファイルを開いたほかのタブと、自分の保存を見分ける */
  const clientId = crypto.randomUUID();
  const headers = { [TOKEN_HEADER]: session.token };

  async function load(): Promise<LoadResult> {
    try {
      const response = await fetch(`${base}/api/document`, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(await errorOf(response));
      const body = v.parse(DocumentResponseSchema, await response.json());
      revision = body.status === "missing" ? null : body.revision;
      return body;
    } catch (error) {
      return { status: "error", error };
    }
  }

  const store: DocumentStore = {
    kind: "file",
    label: session.file,
    async save(diagram, options = {}): Promise<SaveResult> {
      const body = JSON.stringify({ diagram, baseRevision: revision, force: options.force });
      try {
        const response = await fetch(`${base}/api/document`, {
          method: "PUT",
          headers: { ...headers, [CLIENT_HEADER]: clientId, "content-type": "application/json" },
          body,
          keepalive: options.keepalive && new Blob([body]).size < KEEPALIVE_LIMIT_BYTES,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        // サーバーを起動し直すとトークンが変わり、このページからは保存できなくなる
        if (response.status === 403) return { ok: false, reason: "disconnected" };
        if (!response.ok && response.status !== 409) throw new Error(await errorOf(response));
        const result = v.parse(SaveResponseSchema, await response.json());
        if (result.status === "conflict") return { ok: false, reason: "conflict" };
        revision = result.revision;
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: "failed", error };
      }
    },
    watch(handlers) {
      const source = new EventSource(
        `${base}/api/events?token=${encodeURIComponent(session.token)}`,
      );
      let lost = false;
      let grace: ReturnType<typeof setTimeout> | undefined;
      let lastHeard = Date.now();
      /** 何か届いたら生きている。切れたとみなしていたなら、戻ったことを知らせる */
      const heard = () => {
        lastHeard = Date.now();
        clearTimeout(grace);
        grace = undefined;
        if (!lost) return;
        lost = false;
        handlers.restored();
      };
      // 止まったわけではないのに応答しないサーバー（Ctrl+Z で一時停止したなど）は、
      // つなぎ直しの知らせも来ないので、届くはずの ping が途絶えたことで見分ける
      const watchdog = setInterval(() => {
        if (Date.now() - lastHeard > SILENCE_LIMIT_MS) disconnect();
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
        if (!result.success || result.output.writer === clientId) return;
        if (result.output.revision !== revision) handlers.change();
      };
      source.addEventListener("change", onRevision);
      // つないだ（つなぎ直した）ときに届く、その時点の版。切れていた間の変更を取りこぼさない
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
        // 一時的に切れたときはブラウザが自動でつなぎ直す。サーバーを止めると、つなぎ直しを
        // 繰り返すだけで知らせが無いので、しばらく戻らなければ切れたとみなす。トークンが
        // 変わったときは CLOSED になり、もう戻らない
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
