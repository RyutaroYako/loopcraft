export interface CanvasNote {
  target: Element;
  title?: string;
  text?: string;
}

export const NOTE_HOVER_DELAY = 500;

interface Timers {
  set: (run: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const browserTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

// 重ねてすぐ出さないのは、キャンバスの上を動かすだけで印を横切るたびに出て、図が隠れるため
export const createNoteState = (
  apply: (note: CanvasNote | null) => void,
  timers: Timers = browserTimers,
) => {
  let pending: { handle: unknown; target: Element } | undefined;
  let shown: CanvasNote | null = null;
  const set = (note: CanvasNote | null) => {
    shown = note;
    apply(note);
  };
  const cancel = () => {
    if (pending) timers.clear(pending.handle);
    pending = undefined;
  };
  return {
    hover(note: CanvasNote) {
      cancel();
      const handle = timers.set(() => {
        pending = undefined;
        if (note.target.isConnected) set(note);
      }, NOTE_HOVER_DELAY);
      pending = { handle, target: note.target };
    },
    focus(note: CanvasNote) {
      cancel();
      set(note);
    },
    // まとめて消さないのは、ポインターが離れた要素とは別の、フォーカス中の要素の説明まで消えるため
    leave(target: Element) {
      if (pending?.target === target) cancel();
      if (shown?.target === target) set(null);
    },
    // 消えた要素からの知らせを待たないのは、図から消えた矢印や記号は blur も pointerleave も送らないため
    prune() {
      if (pending && !pending.target.isConnected) cancel();
      if (shown && !shown.target.isConnected) set(null);
    },
    clear() {
      cancel();
      set(null);
    },
  };
};
