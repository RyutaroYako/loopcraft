import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { isFocusLost, refocusWhenLost } from "./focus.ts";

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

describe("refocusWhenLost", () => {
  it("描画の後でフォーカスを失っていれば移し、ほかへ移っていれば奪わない", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    const target = document.createElement("button");
    const other = document.createElement("input");
    document.body.append(target, other);

    const pressed = document.createElement("button");
    document.body.append(pressed);
    pressed.focus();
    pressed.remove();
    refocusWhenLost(() => target);
    expect(document.activeElement).toBe(target);

    other.focus();
    refocusWhenLost(() => target);
    expect(document.activeElement).toBe(other);
  });
});
