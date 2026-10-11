import { SESSION_META_NAME, SessionSchema, type Session } from "@loopcraft/core/session";
import * as v from "valibot";

/**
 * `loopcraft serve` が埋め込んだセッションを読む。ブラウザだけで開いたときは undefined、
 * 埋め込まれているのに読めないときは "invalid"（黙ってブラウザに保存してしまわないよう区別する）
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
