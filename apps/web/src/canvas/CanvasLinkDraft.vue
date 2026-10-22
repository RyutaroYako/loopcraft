<script setup lang="ts">
import { computed } from "vue";
import { DEFAULT_CURVATURE, defaultCurvature, linkGeometry } from "@loopcraft/core/geometry";
import type { NodeBox } from "../editor/boxes.ts";
import { injectEditor } from "../editor/useEditor.ts";
import type { LinkDraft } from "./linkDraft.ts";

const { draft } = defineProps<{ draft: LinkDraft }>();

const NO_SIZE = { width: 0, height: 0 };

const editor = injectEditor();
const path = computed(() => {
  const from = editor.boxes.value.get(draft.from);
  if (!from) return undefined;
  const target = draft.target ? editor.boxes.value.get(draft.target) : undefined;
  const to: NodeBox = target ?? { center: draft.to, size: NO_SIZE };
  const curvature = draft.target
    ? defaultCurvature(editor.hasReverse({ from: draft.from, to: draft.target }))
    : DEFAULT_CURVATURE;
  return linkGeometry(from, to, curvature).path;
});
</script>

<template>
  <path class="canvas-link-draft" :d="path" marker-end="url(#arrowhead)" />
</template>

<style scoped>
.canvas-link-draft {
  fill: none;
  stroke: var(--color-accent);
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
  pointer-events: none;
}
</style>
