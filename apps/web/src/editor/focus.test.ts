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
    const runFrames = () => frames.splice(0).forEach((callback) => callback(0));
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

describe("refocusWhenLost の候補", () => {
  it("先頭から試し、外れた要素や受け取れない要素は飛ばし、移せたところで止める", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    const detached = document.createElement("button");
    const disabled = document.createElement("button");
    disabled.disabled = true;
    const target = document.createElement("button");
    document.body.append(disabled, target);
    const after = vi.fn(() => document.createElement("button"));
    refocusWhenLost(
      () => null,
      () => detached,
      () => disabled,
      () => target,
      after,
    );
    expect(document.activeElement).toBe(target);
    expect(after).not.toHaveBeenCalled();
  });
});
