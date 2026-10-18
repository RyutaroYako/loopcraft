<script setup lang="ts">
import { computed } from "vue";
import * as edit from "@loopcraft/core/edit";
import type { LinkGeometry } from "@loopcraft/core/geometry";
import type { Link } from "@loopcraft/core/schema";
import { labelOf } from "../editor/labels.ts";
import { injectEditor } from "../editor/useEditor.ts";
import { delayMarkPath } from "@loopcraft/core/glyphs";

const { link, geometry } = defineProps<{ link: Link; geometry: LinkGeometry }>();

const editor = injectEditor();
const selected = computed(() => {
  const selection = editor.selection.value;
  return selection?.kind === "link" && selection.id === link.id;
});
const outside = computed(() => {
  const emphasis = editor.emphasis.value;
  return emphasis && !emphasis.links.has(link.id) ? emphasis.kind : undefined;
});
const classes = computed(() => ({
  negative: link.polarity === "-",
  positive: link.polarity !== "-",
  selected: selected.value,
  highlighted: editor.highlightedLoop.value?.links.has(link.id) ?? false,
  dimmed: outside.value === "loop",
  faded: outside.value === "neighborhood",
}));
const delayPath = computed(() =>
  link.delay ? delayMarkPath(geometry.middle, geometry.tangent) : undefined,
);
const description = computed(() => {
  const polarity = link.polarity === "-" ? "マイナス" : "プラス";
  return `${labelOf(editor, link.from)}から${labelOf(editor, link.to)}への関連（${polarity}）`;
});

function select(event: PointerEvent) {
  if (event.button !== 0) return;
  event.stopPropagation();
  editor.setEditingVariable(null);
  editor.select({ kind: "link", id: link.id });
}

function toggle() {
  editor.commit(edit.togglePolarity(editor.diagram.value, link.id));
}

function onFocus() {
  if (!selected.value) editor.select({ kind: "link", id: link.id });
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  editor.select({ kind: "link", id: link.id });
  toggle();
}
</script>

<template>
  <g class="canvas-link" :class="classes" :data-link-id="link.id">
    <path class="hit-path" :d="geometry.path" @pointerdown="select" />
    <path class="line-path" :d="geometry.path" marker-end="url(#arrowhead)" />
    <path v-if="delayPath" class="delay-path" :d="delayPath" />
    <g
      class="polarity-button"
      :transform="`translate(${geometry.label.x} ${geometry.label.y})`"
      role="button"
      tabindex="0"
      :aria-label="description"
      @pointerdown="select"
      @focus="onFocus"
      @click="toggle"
      @keydown="onKeyDown"
    >
      <title>クリックで極性を切り替え</title>
      <circle class="sign-circle" r="11" />
      <text class="sign-text" text-anchor="middle" dominant-baseline="central">
        {{ link.polarity === "-" ? "−" : "+" }}
      </text>
    </g>
  </g>
</template>

<style scoped>
.canvas-link {
  transition: opacity 0.35s var(--ease-out);

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

  > .hit-path {
    fill: none;
    stroke: transparent;
    stroke-width: 14;
    cursor: pointer;
  }

  > .line-path {
    fill: none;
    stroke: var(--color-link);
    stroke-width: 1.5;
    pointer-events: none;
    transition: stroke var(--duration-fast) var(--ease-out);
  }

  &:hover > .line-path {
    stroke: var(--color-ink-2);
  }

  &.selected > .line-path {
    stroke: var(--color-accent);
    stroke-width: 2;
  }

  &.highlighted > .line-path {
    stroke: var(--color-accent);
    stroke-width: 2;
    stroke-dasharray: 7 5;
    animation: link-flow 0.9s linear infinite;
  }

  > .delay-path {
    fill: none;
    stroke: var(--color-ink-2);
    stroke-width: 1.5;
    stroke-linecap: round;
    pointer-events: none;
  }

  > .polarity-button {
    cursor: pointer;

    &:focus-visible {
      outline: none;
    }

    > .sign-circle {
      fill: var(--color-surface);
      stroke: var(--color-line-strong);
      stroke-width: 1;
      transition: stroke var(--duration-fast) var(--ease-out);
    }

    &:focus-visible > .sign-circle {
      stroke: var(--color-accent);
      stroke-width: 1.5;
    }

    &:hover > .sign-circle {
      stroke: var(--color-accent);
    }

    > .sign-text {
      font-family: var(--font-mono);
      font-size: var(--text-md);
      font-weight: 600;
      fill: var(--color-ink);
      pointer-events: none;
    }
  }

  &.negative > .polarity-button {
    > .sign-circle {
      fill: var(--color-negative-tint);
    }

    > .sign-text {
      fill: var(--color-negative);
    }
  }

  &.selected > .polarity-button > .sign-circle {
    stroke: var(--color-accent);
  }
}

@keyframes link-flow {
  to {
    stroke-dashoffset: -12;
  }
}
</style>
