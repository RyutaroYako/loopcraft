<script setup lang="ts">
import { Toggle, VisuallyHidden } from "reka-ui";
import SvgIcon from "../primitives/SvgIcon.vue";

const { open, running } = defineProps<{ open: boolean; running: boolean }>();

const emit = defineEmits<{ "update:open": [open: boolean] }>();
</script>

<template>
  <Toggle
    :model-value="open"
    as-child
    @update:model-value="(next: boolean) => emit('update:open', next)"
  >
    <button type="button" class="agent-toggle">
      <SvgIcon name="spark" />
      <span class="label-text">AI</span>
      <!-- 色の点だけにしないのは、読み上げでは動いているかが分からないため -->
      <span v-if="running" class="running-badge" aria-hidden="true" />
      <VisuallyHidden v-if="running">（動いています）</VisuallyHidden>
    </button>
  </Toggle>
</template>

<style scoped>
.agent-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  block-size: 32px;
  padding-inline: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-ink-2);
  transition:
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);

  &:hover {
    background: var(--color-surface-2);
    color: var(--color-ink);
  }

  &[aria-pressed="true"] {
    background: var(--color-surface-2);
    color: var(--color-ink);
  }

  > .running-badge {
    inline-size: 6px;
    block-size: 6px;
    border-radius: var(--radius-full);
    background: var(--color-accent);
    animation: var(--animate-save-pulse);
  }
}
</style>
