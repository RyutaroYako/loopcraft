import { onUnmounted, shallowRef, watch } from "vue";
import type { WatchSource } from "vue";
import { createNoteState } from "./note.ts";
import type { CanvasNote } from "./note.ts";

export const useCanvasNote = (changes: WatchSource) => {
  const note = shallowRef<CanvasNote | null>(null);
  const state = createNoteState((next) => {
    note.value = next;
  });
  watch(changes, () => state.prune(), { flush: "post" });
  onUnmounted(() => state.clear());
  return {
    note,
    show: (next: CanvasNote, immediate: boolean) =>
      immediate ? state.focus(next) : state.hover(next),
    hide: (target: Element) => state.leave(target),
    close: () => state.clear(),
  };
};
