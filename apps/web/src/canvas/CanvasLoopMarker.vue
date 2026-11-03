<script setup lang="ts">
import { computed } from "vue";
import { centroid, isClockwise } from "@loopcraft/core/geometry";
import type { LoopEntry } from "@loopcraft/core/loops";
import type { Loop, LoopId, Point } from "@loopcraft/core/schema";
import { injectEditor } from "../editor/useEditor.ts";
import { LOOP_ARC, LOOP_ARROW_HEAD } from "@loopcraft/core/glyphs";
import { kindLabel } from "../sidebar/loopText.ts";
import type { CanvasNote } from "./note.ts";

const { loop, entry } = defineProps<{ loop: Loop; entry: LoopEntry }>();

const emit = defineEmits<{
  "pointerdown:marker": [event: PointerEvent, id: LoopId, at: Point];
  "note:show": [note: CanvasNote, immediate: boolean];
  "note:hide": [];
}>();

const editor = injectEditor();
const id = computed(() => loop.id);
const points = computed(() => {
  const variables = editor.variableById.value;
  return entry.variables.flatMap((variable) => {
    const found = variables.get(variable);
    return found ? [found.position] : [];
  });
});
const position = computed(() => loop.marker ?? centroid(points.value));
const selected = computed(() => {
  const selection = editor.selection.value;
  return selection?.kind === "loop" && selection.id === id.value;
});
const classes = computed(() => {
  const highlighted = editor.highlightedLoop.value;
  const emphasis = editor.emphasis.value;
  return {
    [entry.kind]: true,
    selected: selected.value,
    dimmed: highlighted !== undefined && highlighted.key !== entry.key,
    // 記号だけ元の濃さで残すと、薄くしたまわりの変数より目立ってしまう
    faded: emphasis?.kind === "neighborhood" && !entry.variables.includes(emphasis.center),
  };
});
const name = computed(() => loop.name ?? "");
const noteTitle = computed(() =>
  name.value ? `${name.value}（${kindLabel(entry.kind)}）` : kindLabel(entry.kind),
);

function showNote(event: Event, immediate: boolean) {
  const target = event.currentTarget;
  if (!(target instanceof Element)) return;
  emit("note:show", { target, title: noteTitle.value, text: loop.description }, immediate);
}

function onFocus(event: FocusEvent) {
  showNote(event, true);
  if (!selected.value) editor.select({ kind: "loop", id: id.value });
}

function onPointerDown(event: PointerEvent) {
  emit("note:hide");
  emit("pointerdown:marker", event, id.value, position.value);
}

function onPointerEnter(event: PointerEvent) {
  editor.setHoveredLoop(entry.key);
  showNote(event, false);
}

function onPointerLeave() {
  editor.setHoveredLoop(null);
  emit("note:hide");
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  editor.select({ kind: "loop", id: id.value });
}
</script>

<template>
  <g
    class="canvas-loop-marker"
    :class="classes"
    :transform="`translate(${position.x} ${position.y})`"
    role="button"
    tabindex="0"
    :aria-label="`${entry.featured?.badge ?? ''} ${name}`"
    :aria-pressed="selected"
    @pointerdown="onPointerDown"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @focus="onFocus"
    @blur="() => emit('note:hide')"
    @keydown="onKeyDown"
  >
    <desc v-if="loop.description">{{ loop.description }}</desc>
    <circle class="backdrop-circle" r="26" />
    <g class="direction-arrow" :transform="isClockwise(points) ? undefined : 'scale(-1 1)'">
      <path class="arc-path" :d="LOOP_ARC" />
      <path class="head-path" :d="LOOP_ARROW_HEAD" />
    </g>
    <text class="badge-text" text-anchor="middle" dominant-baseline="central">
      {{ entry.featured?.badge }}
    </text>
    <text v-if="name" class="name-text" y="42" text-anchor="middle">{{ name }}</text>
  </g>
</template>

<style scoped>
.canvas-loop-marker {
  cursor: grab;
  transition: opacity 0.35s var(--ease-out);

  .canvas-svg[data-readonly] & {
    cursor: pointer;
  }

  &:focus-visible {
    outline: none;
  }

  &.dimmed {
    opacity: 0.22;
  }

  /* ループの強調と同じ 0.22 にしないのは、選ぶたびに名前が読めなくなるため */
  &.faded {
    opacity: 0.45;
  }

  /* 矢印を引く間や動かす間も薄いままにしないのは、行き先が見えなくなるため */
  .canvas-svg[data-gesture="connect"] &.faded,
  .canvas-svg[data-gesture="move"] &.faded {
    opacity: 1;
  }

  > .backdrop-circle {
    fill: var(--color-glass);
    stroke: var(--color-line);
    stroke-width: 1;
    transition: stroke var(--duration-fast) var(--ease-out);
  }

  &:focus-visible > .backdrop-circle,
  &.selected > .backdrop-circle {
    stroke: var(--color-accent);
    stroke-width: 1.5;
  }

  /* 2 本の線をそれぞれ塗らないのは、線の色と太さは g から引き継がれるため */
  > .direction-arrow {
    fill: none;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  &.reinforcing > .direction-arrow {
    stroke: var(--color-accent);
  }

  &.balancing > .direction-arrow {
    stroke: var(--color-ink-2);
  }

  > .badge-text {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 600;
    fill: var(--color-ink);
    pointer-events: none;
  }

  > .name-text {
    font-size: var(--text-sm);
    font-weight: 500;
    fill: var(--color-ink-2);
    paint-order: stroke;
    stroke: var(--color-canvas);
    stroke-width: 4px;
    stroke-linejoin: round;
    pointer-events: none;
  }
}
</style>
