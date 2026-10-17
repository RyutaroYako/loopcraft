import type { ShallowRef } from "vue";
import { computed, shallowRef } from "vue";
import type { Diagram } from "@loopcraft/core/schema";
import { emptyHistory, record, recordEdit, redo, undo } from "./history.ts";
import type { History } from "./history.ts";

export interface Gesture {
  /** 履歴には残さない */
  preview(next: Diagram): void;
  /** 開始時からの変化を 1 回の編集として残す */
  end(): void;
  /** 開始時の図に戻す。履歴にも残さない */
  cancel(): void;
}

export function useHistory(diagram: ShallowRef<Diagram>) {
  // shallowRef にするのは、深い ref だと取り消しで戻した図がプロキシに替わり、=== で見分けられないため
  const history = shallowRef<History>(emptyHistory);
  let activeGesture: { base: Diagram } | undefined;

  const size = computed(() => ({
    undo: history.value.past.length,
    redo: history.value.future.length,
  }));

  function commit(next: Diagram, coalesceKey?: string) {
    finishGesture();
    if (next === diagram.value) return;
    history.value = recordEdit(history.value, diagram.value, coalesceKey, Date.now());
    diagram.value = next;
  }

  /**
   * ハンドルが自分のジェスチャーかを確かめるのは、別のジェスチャーや編集が割り込んだ後に
   * 古いハンドルを呼んでも履歴を壊さないため
   */
  function beginGesture(): Gesture {
    finishGesture();
    const state = { base: diagram.value };
    activeGesture = state;
    return {
      preview(next) {
        if (activeGesture === state) diagram.value = next;
      },
      end() {
        if (activeGesture === state) finishGesture();
      },
      cancel() {
        if (activeGesture !== state) return;
        activeGesture = undefined;
        diagram.value = state.base;
      },
    };
  }

  function finishGesture() {
    const state = activeGesture;
    activeGesture = undefined;
    if (!state || state.base === diagram.value) return;
    history.value = record(history.value, state.base);
  }

  function travel(move: typeof undo) {
    finishGesture();
    const result = move(history.value, diagram.value);
    if (!result) return false;
    history.value = result.history;
    diagram.value = result.diagram;
    return true;
  }

  function applyExternal(next: Diagram) {
    finishGesture();
    if (next === diagram.value) return false;
    history.value = record(history.value, diagram.value);
    diagram.value = next;
    return true;
  }

  return {
    size,
    commit,
    beginGesture,
    undo: () => travel(undo),
    redo: () => travel(redo),
    applyExternal,
  };
}
