import { SESSION_META_NAME, SessionSchema } from "@loopcraft/core/session";
import type { Session } from "@loopcraft/core/session";
import * as v from "valibot";

/**
 * 埋め込まれているのに読めないときを undefined（ブラウザだけで開いたとき）と区別するのは、
 * 黙ってブラウザに保存してしまわないため
 */
export function readSession(doc: Document = document): Session | "invalid" | undefined {
  const content = doc.querySelector<HTMLMetaElement>(`meta[name="${SESSION_META_NAME}"]`)?.content;
  if (content === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return "invalid";
  }
  const result = v.safeParse(SessionSchema, parsed);
  return result.success ? result.output : "invalid";
}
