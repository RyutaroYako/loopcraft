import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { isFocusLost } from "./focus.ts";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("isFocusLost", () => {
  it("body にあるときや、要素が無い・外れているときは失ったとみなす", () => {
    expect(isFocusLost()).toBe(true);
    vi.spyOn(document, "activeElement", "get").mockReturnValue(null);
    expect(isFocusLost()).toBe(true);
    vi.spyOn(document, "activeElement", "get").mockReturnValue(document.createElement("button"));
    expect(isFocusLost()).toBe(true);
  });

  it("文書の中の要素にフォーカスがあれば失っていない", () => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    expect(isFocusLost()).toBe(false);
  });
});
