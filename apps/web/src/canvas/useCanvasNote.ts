import { onUnmounted, shallowRef } from "vue";
import { createNoteState } from "./note.ts";
import type { CanvasNote } from "./note.ts";

export const useCanvasNote = () => {
  const note = shallowRef<CanvasNote | null>(null);
  const state = createNoteState((next) => {
    note.value = next;
  });
  onUnmounted(() => state.leave());
  return {
    note,
    show: (next: CanvasNote, immediate: boolean) =>
      immediate ? state.focus(next) : state.hover(next),
    hide: () => state.leave(),
  };
};
