import { describe, expect, it } from "vite-plus/test";
import { readSession } from "./session.ts";

function documentWith(content: string | undefined) {
  const doc = document.implementation.createHTMLDocument();
  if (content !== undefined) {
    const meta = doc.createElement("meta");
    meta.name = "loopcraft-session";
    meta.content = content;
    doc.head.append(meta);
  }
  return doc;
}

describe("readSession", () => {
  it("埋め込まれたセッションを読む", () => {
    const session = { token: "t", file: "a.json", editable: true, readonly: false };
    expect(readSession(documentWith(JSON.stringify(session)))).toEqual(session);
  });

  it("無い・壊れている・形が違うときは undefined", () => {
    expect(readSession(documentWith(undefined))).toBeUndefined();
    expect(readSession(documentWith("{"))).toBeUndefined();
    expect(readSession(documentWith(JSON.stringify({ token: 1 })))).toBeUndefined();
    expect(readSession()).toBeUndefined();
  });
});
