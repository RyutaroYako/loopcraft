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
  it("描画を待ってから確かめ、失っていれば移し、その間にほかへ移っていれば奪わない", () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    // 中で次のフレームを頼まれても、空になるまで流す
    const runFrames = () => {
      while (frames.length > 0) frames.shift()!(0);
    };
    const target = document.createElement("button");
    const other = document.createElement("input");
    const pressed = document.createElement("button");
    document.body.append(target, other, pressed);

    // 押した時点ではまだ消えていない。描画で消えてから確かめる
    pressed.focus();
    refocusWhenLost(() => target);
    pressed.remove();
    runFrames();
    expect(document.activeElement).toBe(target);

    // 描画を待つ間にほかへ移ったフォーカスは奪わない
    target.blur();
    refocusWhenLost(() => target);
    other.focus();
    runFrames();
    expect(document.activeElement).toBe(other);

    // 移す先が無ければ何もしない
    other.blur();
    const missing = vi.fn(() => null);
    refocusWhenLost(missing);
    expect(runFrames).not.toThrow();
    expect(missing).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(document.body);
  });
});
