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
const KEEPALIVE_LIMIT = 60_000;

/** `loopcraft serve` の API とやりとりして、開いたファイルを読み書きする */
export function createFileClient(session: Session, base = "") {
  /** 最後に読んだ・保存したファイルの版。外部での変更と自分の保存を見分ける */
  let revision: Revision | null = null;
  /** この画面の ID。同じファイルを開いたほかのタブと、自分の保存を見分ける */
  const clientId = crypto.randomUUID();
  const headers = { [TOKEN_HEADER]: session.token };

  async function load(): Promise<LoadResult> {
    try {
      const response = await fetch(`${base}/api/document`, { headers });
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
          keepalive: options.keepalive && body.length < KEEPALIVE_LIMIT,
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
      let interrupted = false;
      source.addEventListener("change", (event) => {
        const result = v.safeParse(ChangeEventSchema, parseJson(event.data));
        if (!result.success || result.output.writer === clientId) return;
        if (result.output.revision !== revision) handlers.change();
      });
      source.addEventListener("watch-error", (event) => {
        const data = parseJson(event.data);
        const reason =
          typeof data === "object" && data !== null && "reason" in data ? String(data.reason) : "";
        handlers.lost("unwatched", reason);
      });
      source.addEventListener("error", () => {
        // 一時的に切れたときはブラウザが自動でつなぎ直す。つなぎ直せないとき（トークンが
        // 変わったなど）は CLOSED になり、もう知らせは届かない
        if (source.readyState === EventSource.CLOSED) handlers.lost("disconnected");
        else interrupted = true;
      });
      source.addEventListener("open", () => {
        // 切れていた間の変更を取りこぼさないよう、つなぎ直したら確かめ直す
        if (interrupted) handlers.change();
        interrupted = false;
      });
      return () => source.close();
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
