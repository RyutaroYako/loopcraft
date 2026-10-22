<script setup lang="ts">
import { computed } from "vue";
import * as edit from "@loopcraft/core/edit";
import type { Point, Variable, VariableId } from "@loopcraft/core/schema";
import { UNNAMED } from "../editor/boxes.ts";
import type { NodeBox } from "../editor/boxes.ts";
import { injectEditor } from "../editor/useEditor.ts";

const { variable, box, connectTarget } = defineProps<{
  variable: Variable;
  box: NodeBox;
  connectTarget: boolean;
}>();

const emit = defineEmits<{
  "pointerdown:body": [event: PointerEvent, id: VariableId];
  "pointerdown:handle": [event: PointerEvent, id: VariableId];
}>();

const ARROW_OFFSETS: Partial<Record<string, Point>> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

const editor = injectEditor();
const id = computed(() => variable.id);
const label = computed(() => variable.label);
const selected = computed(() => {
  const selection = editor.selection.value;
  return selection?.kind === "variable" && selection.id === id.value;
});
const outside = computed(() => {
  const emphasis = editor.emphasis.value;
  return emphasis && !emphasis.variables.has(id.value) ? emphasis.kind : undefined;
});
const classes = computed(() => ({
  selected: selected.value,
  highlighted: editor.highlightedLoop.value?.variables.has(id.value) ?? false,
  dimmed: outside.value === "loop",
  faded: outside.value === "neighborhood",
  target: connectTarget,
  editing: editor.editingVariable.value === id.value,
  unnamed: label.value === "",
}));

function onFocus() {
  // フォーカスと選択を別々にしないと、Delete や検査パネルがフォーカスしていない要素に効く
  if (!selected.value) editor.select({ kind: "variable", id: id.value });
}

function onKeyDown(event: KeyboardEvent) {
  const step = event.shiftKey ? 40 : 8;
  const offset = ARROW_OFFSETS[event.key];
  if (offset) {
    event.preventDefault();
    const { position } = variable;
    editor.select({ kind: "variable", id: id.value });
    const moved = { x: position.x + offset.x * step, y: position.y + offset.y * step };
    editor.commit(
      edit.moveVariables(editor.diagram.value, new Map([[id.value, moved]])),
      `move:${id.value}`,
    );
    return;
  }
  if (event.key === "F2" || (event.key === "Enter" && selected.value)) {
    event.preventDefault();
    editor.select({ kind: "variable", id: id.value });
    editor.setEditingVariable(id.value);
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    editor.select({ kind: "variable", id: id.value });
  }
}
</script>

<template>
  <g
    class="canvas-node"
    :class="classes"
    :transform="`translate(${box.center.x} ${box.center.y})`"
    role="button"
    tabindex="0"
    :aria-label="label || UNNAMED"
    :aria-pressed="selected"
    aria-keyshortcuts="Enter F2 ArrowUp ArrowDown ArrowLeft ArrowRight Delete"
    :data-variable-id="id"
    @pointerdown="(event) => emit('pointerdown:body', event, id)"
    @focus="onFocus"
    @keydown="onKeyDown"
  >
    <rect
      class="body-rect"
      :x="-box.size.width / 2"
      :y="-box.size.height / 2"
      :width="box.size.width"
      :height="box.size.height"
      :rx="box.size.height / 2"
    />
    <text class="label-text" text-anchor="middle" dominant-baseline="central">
      {{ label || UNNAMED }}
    </text>
    <!-- キーボードで操作できなくてよいのは、矢印はドラッグで引くものに絞っているため -->
    <g
      v-if="editor.editable"
      class="connect-handle"
      aria-hidden="true"
      :transform="`translate(${box.size.width / 2} 0)`"
      @pointerdown="(event) => emit('pointerdown:handle', event, id)"
    >
      <title>ドラッグでほかの変数につなぐ</title>
      <circle class="hit-circle" r="11" />
      <circle class="dot-circle" r="4.5" />
    </g>
  </g>
</template>

<style scoped>
.canvas-node {
  cursor: grab;
  transition: opacity 0.35s var(--ease-out);

  .canvas-svg[data-gesture="pan"] &,
  .canvas-svg[data-gesture="connect"] & {
    cursor: inherit;
  }

  .canvas-svg[data-readonly] & {
    cursor: pointer;
  }

  &:focus-visible {
    outline: none;
  }

  &.editing {
    opacity: 0;
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

  > .body-rect {
    fill: var(--color-surface);
    stroke: var(--color-line-strong);
    stroke-width: 1;
    filter: var(--shadow-node);
    transition:
      stroke var(--duration-fast) var(--ease-out),
      fill var(--duration-fast) var(--ease-out);
  }

  &:hover > .body-rect {
    stroke: var(--color-faint);
  }

  &:focus-visible > .body-rect,
  &.selected > .body-rect {
    stroke: var(--color-accent);
    stroke-width: 1.5;
  }

  &.highlighted > .body-rect {
    stroke: var(--color-accent);
    fill: var(--color-accent-tint);
  }

  &.target > .body-rect {
    stroke: var(--color-accent);
    stroke-width: 2;
    fill: var(--color-accent-tint);
  }

  > .label-text {
    font-size: var(--text-md);
    font-weight: 500;
    fill: var(--color-ink);
    pointer-events: none;
  }

  &.unnamed > .label-text {
    fill: var(--color-faint);
    font-style: italic;
  }

  /* パンや矢印を引く間に隠さないのは、選んだ変数の点まで消え、どこから引いているかが分からなくなるため */
  > .connect-handle {
    cursor: crosshair;
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-out);

    > .hit-circle {
      fill: transparent;
    }

    > .dot-circle {
      fill: var(--color-surface);
      stroke: var(--color-accent);
      stroke-width: 1.5;
      transition: transform var(--duration-fast) var(--ease-out);
    }

    &:hover > .dot-circle {
      fill: var(--color-accent);
      transform: scale(1.25);
    }
  }

  &:hover > .connect-handle,
  &.selected > .connect-handle,
  &:focus-visible > .connect-handle {
    opacity: 1;
  }

  /* 見た目どおりの大きさにしないのは、指では 9px の点に当たらないため */
  @media (pointer: coarse) {
    > .connect-handle {
      > .hit-circle {
        r: 22px;
      }

      > .dot-circle {
        r: 7px;
      }
    }

    /* 選んでいない変数の点で受けないのは、ホバーの無い指では点が見えず、変数を押したつもりのタップを吸うため */
    &:not(.selected) > .connect-handle {
      pointer-events: none;
    }
  }
}
</style>
