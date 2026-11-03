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
  let pending: unknown;
  const cancel = () => {
    if (pending !== undefined) timers.clear(pending);
    pending = undefined;
  };
  return {
    hover(note: CanvasNote) {
      cancel();
      pending = timers.set(() => {
        pending = undefined;
        apply(note);
      }, NOTE_HOVER_DELAY);
    },
    focus(note: CanvasNote) {
      cancel();
      apply(note);
    },
    leave() {
      cancel();
      apply(null);
    },
  };
};
