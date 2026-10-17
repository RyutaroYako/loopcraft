<script setup lang="ts">
import { computed } from "vue";
import type { LinkId, VariableId } from "@loopcraft/core/schema";
import { injectEditor } from "../editor/useEditor.ts";
import { labelOf } from "../editor/labels.ts";
import PolarityGlyph from "./PolarityGlyph.vue";

const { links, variables } = defineProps<{
  links: readonly LinkId[];
  variables: readonly VariableId[];
}>();

const editor = injectEditor();
const steps = computed(() =>
  links.map((id, index) => ({
    key: `${index}:${id}`,
    label: labelOf(editor, variables[index]),
    polarity: editor.linkById.value.get(id)?.polarity ?? "+",
  })),
);
</script>

<template>
  <ol class="loop-path">
    <li v-for="step in steps" :key="step.key" class="step-item">
      <span class="variable-text">{{ step.label }}</span>
      <PolarityGlyph :polarity="step.polarity" />
    </li>
  </ol>
</template>

<style scoped>
.loop-path {
  position: relative;
  display: grid;
  gap: 2px;
  padding-inline-start: 14px;

  &::before {
    position: absolute;
    inset-block: 10px;
    inset-inline-start: 3px;
    border-inline-start: 1px dashed var(--color-line-strong);
    content: "";
  }

  &::after {
    padding-block-start: 2px;
    font-size: var(--text-xs);
    color: var(--color-faint);
    content: "先頭に戻る";
  }

  > .step-item {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-block: 4px;
    font-size: var(--text-base);

    &::before {
      position: absolute;
      inset-inline-start: -14px;
      block-size: 7px;
      inline-size: 7px;
      border: 1.5px solid var(--color-accent);
      border-radius: var(--radius-full);
      background: var(--color-surface);
      content: "";
    }
  }
}
</style>
