import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { NOTE_HOVER_DELAY, createNoteState } from "./note.ts";
import type { CanvasNote } from "./note.ts";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

const element = () => document.body.appendChild(document.createElement("span"));

function setup() {
  vi.useFakeTimers();
  let shown: CanvasNote | null = null;
  const state = createNoteState((note) => {
    shown = note;
  });
  return { state, shown: () => shown };
}

describe("createNoteState", () => {
  it("重ねたら少し待って出し、フォーカスしたらすぐ出す", () => {
    const { state, shown } = setup();
    const a = { target: element(), text: "a" };
    state.hover(a);
    expect(shown()).toBeNull();
    vi.advanceTimersByTime(NOTE_HOVER_DELAY);
    expect(shown()).toBe(a);
    const b = { target: element(), text: "b" };
    state.focus(b);
    expect(shown()).toBe(b);
  });

  it("離れた要素の説明だけを消し、ほかの要素の説明は残す", () => {
    const { state, shown } = setup();
    const a = { target: element(), text: "a" };
    const b = { target: element(), text: "b" };
    state.hover(a);
    vi.advanceTimersByTime(NOTE_HOVER_DELAY);
    state.focus(b);
    state.leave(a.target);
    expect(shown()).toBe(b);

    state.hover(a);
    state.leave(a.target);
    vi.advanceTimersByTime(NOTE_HOVER_DELAY);
    expect(shown()).toBe(b);
    state.leave(b.target);
    expect(shown()).toBeNull();
  });

  it("図から消えた要素の説明と、待っている説明を捨てる", () => {
    const { state, shown } = setup();
    const a = { target: element(), text: "a" };
    state.focus(a);
    a.target.remove();
    state.prune();
    expect(shown()).toBeNull();

    const b = { target: element(), text: "b" };
    state.hover(b);
    b.target.remove();
    vi.advanceTimersByTime(NOTE_HOVER_DELAY);
    expect(shown()).toBeNull();

    const c = { target: element(), text: "c" };
    state.hover(c);
    c.target.remove();
    state.prune();
    document.body.appendChild(c.target);
    vi.advanceTimersByTime(NOTE_HOVER_DELAY);
    expect(shown()).toBeNull();
    state.focus(c);
    state.clear();
    expect(shown()).toBeNull();
  });
});
