import { SESSION_META_NAME, SessionSchema, type Session } from "@loopcraft/core/session";
import * as v from "valibot";

/** `loopcraft serve` が埋め込んだセッションを読む。ブラウザだけで開いたときは undefined */
export function readSession(doc: Document = document): Session | undefined {
  const content = doc.querySelector<HTMLMetaElement>(`meta[name="${SESSION_META_NAME}"]`)?.content;
  if (!content) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  const result = v.safeParse(SessionSchema, parsed);
  return result.success ? result.output : undefined;
}
