import {
  ChangeEventSchema,
  DocumentResponseSchema,
  SaveResponseSchema,
  TOKEN_HEADER,
  type DocumentResponse,
  type Revision,
  type Session,
} from "@loopcraft/core/session";
import * as v from "valibot";
import type { DocumentStore, SaveResult } from "./store.ts";

export type LoadResult =
  | DocumentResponse
  /** サーバーに届かなかった、または応答が読めなかった */
  | { status: "error"; error: unknown };

/** `loopcraft serve` の API とやりとりして、開いたファイルを読み書きする */
export function createFileClient(session: Session, base = "") {
  /** 最後に読んだ・保存したファイルの版。外部での変更と自分の保存を見分ける */
  let revision: Revision | null = null;
  const headers = { [TOKEN_HEADER]: session.token };

  async function load(): Promise<LoadResult> {
    try {
      const response = await fetch(`${base}/api/document`, { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
      try {
        const response = await fetch(`${base}/api/document`, {
          method: "PUT",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ diagram, baseRevision: revision, force: options.force }),
          keepalive: options.keepalive,
        });
        if (!response.ok && response.status !== 409) throw new Error(await errorOf(response));
        const body = v.parse(SaveResponseSchema, await response.json());
        if (body.status === "conflict") return { ok: false, reason: "conflict" };
        revision = body.revision;
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: "failed", error };
      }
    },
    watch(onChange) {
      const source = new EventSource(
        `${base}/api/events?token=${encodeURIComponent(session.token)}`,
      );
      source.addEventListener("change", (event) => {
        const result = v.safeParse(ChangeEventSchema, JSON.parse(event.data as string));
        if (result.success && result.output.revision !== revision) onChange();
      });
      return () => source.close();
    },
    async reload() {
      const result = await load();
      return result.status === "ok" ? result.diagram : undefined;
    },
  };

  return { load, store };
}

async function errorOf(response: Response) {
  const text = await response.text().catch(() => "");
  return text ? `HTTP ${response.status}: ${text}` : `HTTP ${response.status}`;
}
